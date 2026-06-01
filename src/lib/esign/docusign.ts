/**
 * DocuSign eSign adapter. Three auth modes (in priority order):
 *
 * 1. **JWT Grant** (production-grade) — when DOCUSIGN_INTEGRATION_KEY +
 *    DOCUSIGN_USER_ID + DOCUSIGN_PRIVATE_KEY are set. We sign an RS256 JWT
 *    locally and exchange it at {OAUTH_HOST}/oauth/token for an access token,
 *    cached in memory until ~60s before expiry.
 * 2. **Static access token** — when DOCUSIGN_ACCESS_TOKEN is set (handy for
 *    one-off testing; expires in ~8h).
 * 3. **Mock** — when none of the above are configured.
 *
 * Required for #1:
 *   DOCUSIGN_INTEGRATION_KEY  (client ID)
 *   DOCUSIGN_USER_ID          (impersonation user GUID)
 *   DOCUSIGN_PRIVATE_KEY      (RSA PEM, supports literal \n escapes)
 *   DOCUSIGN_OAUTH_HOST       (account-d.docusign.com for sandbox, account.docusign.com for live)
 *   DOCUSIGN_BASE_URI         (https://demo.docusign.net for sandbox, https://www.docusign.net for live)
 *   DOCUSIGN_ACCOUNT_ID       (API account GUID)
 */
import crypto from 'crypto';
import { logger } from '../logger';
import { nanoid } from 'nanoid';

export interface DsCreateArgs {
  signerName: string;
  signerEmail: string;
  documentBase64: string; // PDF base64
  filename: string;
  returnUrl?: string;
}
export interface DsCreateResult {
  externalId: string;
  signingUrl: string;
  mock: boolean;
}

function cfg() {
  return {
    base: process.env.DOCUSIGN_BASE_URI,
    account: process.env.DOCUSIGN_ACCOUNT_ID,
    token: process.env.DOCUSIGN_ACCESS_TOKEN,
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    userId: process.env.DOCUSIGN_USER_ID,
    privateKey: process.env.DOCUSIGN_PRIVATE_KEY,
    oauthHost: process.env.DOCUSIGN_OAUTH_HOST,
  };
}

function jwtConfigured(c = cfg()): boolean {
  return !!(c.integrationKey && c.userId && c.privateKey && c.oauthHost && c.base && c.account);
}

export function docusignConfigured(): boolean {
  const c = cfg();
  return jwtConfigured(c) || !!(c.base && c.account && c.token);
}

// ─── base64url helpers ────────────────────────────────────────────────────────
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Normalize PEM: env vars sometimes store \n as the literal two-char sequence. */
function normalizePem(raw: string): string {
  return raw.includes('\\n') && !raw.includes('\n') ? raw.replace(/\\n/g, '\n') : raw;
}

// ─── JWT Grant + token cache ──────────────────────────────────────────────────
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function exchangeJwtForAccessToken(): Promise<string> {
  const c = cfg();
  if (!jwtConfigured(c)) throw new Error('DocuSign JWT not configured');
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256' };
  const payload = {
    iss: c.integrationKey,
    sub: c.userId,
    aud: c.oauthHost, // host only, no scheme
    iat: now,
    exp: now + 3600, // 1h JWT; the access token Docusign issues lasts ~8h
    scope: 'signature impersonation',
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = b64url(signer.sign(normalizePem(c.privateKey!)));
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch(`https://${c.oauthHost}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    // The most common first-time-setup error.
    if (detail.includes('consent_required')) {
      const consentUrl = `https://${c.oauthHost}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${c.integrationKey}&redirect_uri=${encodeURIComponent(process.env.APP_URL ?? 'http://localhost:3000')}`;
      throw new Error(`DocuSign consent_required — grant once at: ${consentUrl}`);
    }
    throw new Error(`DocuSign JWT exchange ${res.status}: ${detail}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh ~1m before expiry
  };
  logger.info({ expiresIn: data.expires_in }, 'docusign.jwt.token-issued');
  return data.access_token;
}

async function getAccessToken(): Promise<string | null> {
  const c = cfg();
  // 1) JWT mode (preferred): cache + refresh.
  if (jwtConfigured(c)) {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.accessToken;
    try { return await exchangeJwtForAccessToken(); }
    catch (e) { logger.error({ err: (e as Error).message }, 'docusign.jwt.exchange-failed'); throw e; }
  }
  // 2) Static token (testing).
  if (c.token) return c.token;
  // 3) Mock.
  return null;
}

// ─── public adapter API ───────────────────────────────────────────────────────
export async function createDocusignEnvelope(args: DsCreateArgs): Promise<DsCreateResult> {
  const c = cfg();
  const token = await getAccessToken().catch((e) => { throw e; });
  if (!token) {
    logger.warn({ signer: args.signerEmail }, 'docusign.mock-mode');
    return { externalId: `mock-ds-${nanoid(10)}`, signingUrl: 'MOCK_SIGN_URL_PLACEHOLDER', mock: true };
  }

  const res = await fetch(`${c.base}/v2.1/accounts/${c.account}/envelopes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      emailSubject: 'Please sign your agreement',
      status: 'sent',
      documents: [{ documentBase64: args.documentBase64, name: args.filename, fileExtension: 'pdf', documentId: '1' }],
      recipients: {
        signers: [{
          email: args.signerEmail, name: args.signerName, recipientId: '1', routingOrder: '1',
          tabs: { signHereTabs: [{ anchorString: 'Client:', anchorUnits: 'pixels', anchorXOffset: '60', anchorYOffset: '-6' }] },
        }],
      },
    }),
  });
  if (!res.ok) throw new Error(`DocuSign ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { envelopeId: string };
  return { externalId: data.envelopeId, signingUrl: args.returnUrl ?? '', mock: false };
}

/** Download the combined signed PDF for a completed envelope. */
export async function downloadDocusignSigned(envelopeId: string): Promise<Buffer | null> {
  const c = cfg();
  const token = await getAccessToken().catch(() => null);
  if (!token) return null;
  try {
    const res = await fetch(`${c.base}/v2.1/accounts/${c.account}/envelopes/${envelopeId}/documents/combined`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
