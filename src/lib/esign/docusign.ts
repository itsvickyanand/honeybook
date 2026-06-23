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

import { resolveIntegration } from '../integrations/resolve';

interface DsConfig {
  base?: string;
  account?: string;
  token?: string;
  integrationKey?: string;
  userId?: string;
  privateKey?: string;
  oauthHost?: string;
  /** Where the creds came from — drives demo-mode banners. */
  source?: 'tenant' | 'platform' | 'env';
}

/**
 * Per-tenant credential resolution.
 *
 * If a tenantId is provided AND the tenant has a CONNECTED DocuSign Integration
 * row, those credentials are used. Otherwise we fall back to the platform's
 * env vars — that's the "demo mode" path. Demo mode is fine for prototyping;
 * production use requires each tenant to connect their own DocuSign account so
 * envelopes are legally issued from THEIR organization, not the platform's.
 */
async function cfgFor(tenantId?: string): Promise<DsConfig> {
  if (tenantId) {
    const resolved = await resolveIntegration('docusign', tenantId);
    if (resolved && resolved.source === 'tenant') {
      const c = resolved.credentials;
      return {
        integrationKey: c.integrationKey,
        userId: c.userId,
        privateKey: c.privateKey,
        oauthHost: c.oauthHost,
        base: c.baseUri,
        account: c.accountId,
        token: c.accessToken,
        source: 'tenant',
      };
    }
  }
  // Platform fallback (demo mode).
  return {
    base: process.env.DOCUSIGN_BASE_URI,
    account: process.env.DOCUSIGN_ACCOUNT_ID,
    token: process.env.DOCUSIGN_ACCESS_TOKEN,
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    userId: process.env.DOCUSIGN_USER_ID,
    privateKey: process.env.DOCUSIGN_PRIVATE_KEY,
    oauthHost: process.env.DOCUSIGN_OAUTH_HOST,
    source: 'env',
  };
}

/** Synchronous env-only cfg — used by JWT signing helpers that don't yet have
 *  tenant context. The async path above is the canonical one. */
function cfg(): DsConfig {
  return {
    base: process.env.DOCUSIGN_BASE_URI,
    account: process.env.DOCUSIGN_ACCOUNT_ID,
    token: process.env.DOCUSIGN_ACCESS_TOKEN,
    integrationKey: process.env.DOCUSIGN_INTEGRATION_KEY,
    userId: process.env.DOCUSIGN_USER_ID,
    privateKey: process.env.DOCUSIGN_PRIVATE_KEY,
    oauthHost: process.env.DOCUSIGN_OAUTH_HOST,
    source: 'env',
  };
}

/**
 * The DocuSign REST API lives under `/restapi/v2.1/...`. Customers commonly
 * configure DOCUSIGN_BASE_URI as just the host (`https://demo.docusign.net`),
 * which causes `${base}/v2.1/...` to 404 with an HTML error page. Normalize so
 * the adapter works whether they stored the bare host or the full base.
 */
function apiBase(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  return /\/restapi$/.test(trimmed) ? trimmed : `${trimmed}/restapi`;
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

// ─── JWT Grant + token cache (per credential set) ────────────────────────────
/** Keyed by tenantId or '__platform__' so per-tenant credentials don't share
 *  cached tokens. */
const tokenCache = new Map<string, { accessToken: string; expiresAt: number }>();
function cacheKey(tenantId?: string): string { return tenantId ?? '__platform__'; }

async function exchangeJwtForAccessToken(tenantId?: string): Promise<string> {
  const c = await cfgFor(tenantId);
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
  tokenCache.set(cacheKey(tenantId), {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // refresh ~1m before expiry
  });
  logger.info({ expiresIn: data.expires_in, tenantId: tenantId ?? null, source: c.source }, 'docusign.jwt.token-issued');
  return data.access_token;
}

async function getAccessToken(tenantId?: string): Promise<string | null> {
  const c = await cfgFor(tenantId);
  // 1) JWT mode (preferred): cache + refresh.
  if (jwtConfigured(c)) {
    const cached = tokenCache.get(cacheKey(tenantId));
    if (cached && cached.expiresAt > Date.now()) return cached.accessToken;
    try { return await exchangeJwtForAccessToken(tenantId); }
    catch (e) { logger.error({ err: (e as Error).message, tenantId: tenantId ?? null }, 'docusign.jwt.exchange-failed'); throw e; }
  }
  // 2) Static token (testing).
  if (c.token) return c.token;
  // 3) Mock.
  return null;
}

// ─── public adapter API ───────────────────────────────────────────────────────
/**
 * Create a sent envelope AND immediately mint an embedded-signing URL. The
 * signer gets `clientUserId` set so they count as an embedded recipient (not
 * remote), and we call the recipient-view endpoint to receive a short-lived
 * (~5 min) URL the caller can render in an iframe on their own page.
 */
export async function createDocusignEnvelope(args: DsCreateArgs, tenantId?: string): Promise<DsCreateResult> {
  const c = await cfgFor(tenantId);
  const token = await getAccessToken(tenantId).catch((e) => { throw e; });
  if (!token) {
    logger.warn({ signer: args.signerEmail, tenantId: tenantId ?? null }, 'docusign.mock-mode');
    return { externalId: `mock-ds-${nanoid(10)}`, signingUrl: 'MOCK_SIGN_URL_PLACEHOLDER', mock: true };
  }

  // A stable identifier for this signer-on-this-envelope. DocuSign uses it to
  // distinguish embedded signers from remote (emailed) ones.
  const clientUserId = `signer-${nanoid(12)}`;

  const createRes = await fetch(`${apiBase(c.base!)}/v2.1/accounts/${c.account}/envelopes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      emailSubject: 'Please sign your agreement',
      status: 'sent',
      documents: [{ documentBase64: args.documentBase64, name: args.filename, fileExtension: 'pdf', documentId: '1' }],
      recipients: {
        signers: [{
          email: args.signerEmail,
          name: args.signerName,
          recipientId: '1',
          routingOrder: '1',
          clientUserId, // ← presence of this flips the signer to "embedded"
          tabs: { signHereTabs: [{ anchorString: 'Client:', anchorUnits: 'pixels', anchorXOffset: '60', anchorYOffset: '-6' }] },
        }],
      },
    }),
  });
  if (!createRes.ok) throw new Error(`DocuSign ${createRes.status}: ${await createRes.text()}`);
  const created = (await createRes.json()) as { envelopeId: string };

  // Mint the embedded recipient view (the iframe-able signing URL).
  const viewRes = await fetch(
    `${apiBase(c.base!)}/v2.1/accounts/${c.account}/envelopes/${created.envelopeId}/views/recipient`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        returnUrl: args.returnUrl ?? `${process.env.APP_URL ?? ''}/`,
        authenticationMethod: 'none', // we authenticated them via our share token
        email: args.signerEmail,
        userName: args.signerName,
        clientUserId,
      }),
    },
  );
  if (!viewRes.ok) {
    // The envelope was created — surface the view error but the envelope ID is
    // still useful so the webhook can finalize the signature later.
    throw new Error(`DocuSign recipient view ${viewRes.status}: ${await viewRes.text()}`);
  }
  const view = (await viewRes.json()) as { url: string };

  return { externalId: created.envelopeId, signingUrl: view.url, mock: false };
}

/** Download the combined signed PDF for a completed envelope. */
export async function downloadDocusignSigned(envelopeId: string, tenantId?: string): Promise<Buffer | null> {
  const c = await cfgFor(tenantId);
  const token = await getAccessToken(tenantId).catch(() => null);
  if (!token) return null;
  try {
    const res = await fetch(`${apiBase(c.base!)}/v2.1/accounts/${c.account}/envelopes/${envelopeId}/documents/combined`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
