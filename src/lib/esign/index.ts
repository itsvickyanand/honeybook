/**
 * Unified eSign facade. Routes a signature request to the chosen provider:
 *   - 'digio'    → Aadhaar eSign (India)
 *   - 'docusign' → DocuSign envelope
 *   - mock fallback when the chosen provider isn't configured.
 */
import { createSignRequest, downloadDigioSigned, digioConfigured } from './digio';
import { createDocusignEnvelope, downloadDocusignSigned, docusignConfigured } from './docusign';

export type SignProvider = 'digio' | 'docusign';

export interface CreateSignatureArgs {
  provider: SignProvider;
  signerName: string;
  signerEmail: string;
  signerPhone?: string;
  pdfBase64: string;
  filename: string;
  returnUrl?: string;
}
export interface CreateSignatureResult {
  externalId: string;
  signingUrl: string;
  mock: boolean;
  provider: SignProvider;
}

export function providerConfigured(p: SignProvider): boolean {
  return p === 'docusign' ? docusignConfigured() : digioConfigured();
}

export async function createSignature(args: CreateSignatureArgs): Promise<CreateSignatureResult> {
  if (args.provider === 'docusign') {
    const r = await createDocusignEnvelope({
      signerName: args.signerName,
      signerEmail: args.signerEmail,
      documentBase64: args.pdfBase64,
      filename: args.filename,
      returnUrl: args.returnUrl,
    });
    return { ...r, provider: 'docusign' };
  }
  const r = await createSignRequest({
    signerName: args.signerName,
    signerEmail: args.signerEmail,
    signerPhone: args.signerPhone,
    documentBase64: args.pdfBase64,
    filename: args.filename,
    redirectUrl: args.returnUrl,
  });
  return { ...r, provider: 'digio' };
}

export async function downloadSigned(provider: string, externalId: string): Promise<Buffer | null> {
  if (provider === 'docusign') return downloadDocusignSigned(externalId);
  return downloadDigioSigned(externalId);
}
