/**
 * DocuSign eSign adapter. Mock mode when DocuSign env isn't configured.
 *
 * Env (set later): DOCUSIGN_BASE_URI (e.g. https://demo.docusign.net/restapi),
 * DOCUSIGN_ACCOUNT_ID, DOCUSIGN_ACCESS_TOKEN (OAuth/JWT bearer).
 *
 * Real flow: create an envelope with the PDF + a signer recipient using an
 * embedded/email signing ceremony; DocuSign Connect webhook fires "completed",
 * after which we pull the combined signed PDF.
 */
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
  };
}

export function docusignConfigured(): boolean {
  const c = cfg();
  return !!(c.base && c.account && c.token);
}

export async function createDocusignEnvelope(args: DsCreateArgs): Promise<DsCreateResult> {
  const c = cfg();
  if (!docusignConfigured()) {
    logger.warn({ signer: args.signerEmail }, 'docusign.mock-mode');
    return { externalId: `mock-ds-${nanoid(10)}`, signingUrl: 'MOCK_SIGN_URL_PLACEHOLDER', mock: true };
  }
  // Create envelope (status=sent → emails the signer a signing link).
  const res = await fetch(`${c.base}/v2.1/accounts/${c.account}/envelopes`, {
    method: 'POST',
    headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
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
  // For an email ceremony the signer gets the link by email; return account URL as fallback.
  return { externalId: data.envelopeId, signingUrl: args.returnUrl ?? '', mock: false };
}

/** Download the combined signed PDF for a completed envelope. */
export async function downloadDocusignSigned(envelopeId: string): Promise<Buffer | null> {
  const c = cfg();
  if (!docusignConfigured()) return null;
  try {
    const res = await fetch(`${c.base}/v2.1/accounts/${c.account}/envelopes/${envelopeId}/documents/combined`, {
      headers: { authorization: `Bearer ${c.token}` },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}
