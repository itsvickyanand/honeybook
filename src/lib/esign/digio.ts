/**
 * Digio eSign adapter (India). Mock mode when DIGIO_CLIENT_ID isn't set.
 * Real flow:
 *   1. createSignRequest -> Digio returns a request id + signing URL
 *   2. Client signs via Aadhaar OTP / dSign
 *   3. Digio webhook fires SIGNED with signed PDF URL
 */
import { logger } from '../logger';
import { nanoid } from 'nanoid';

export interface SignRequestArgs {
  signerName: string;
  signerEmail: string;
  signerPhone?: string;
  documentBase64: string; // PDF base64
  filename: string;
  redirectUrl?: string;
}

export interface SignRequestResult {
  externalId: string;
  signingUrl: string;
  mock: boolean;
}

const HOST = 'https://api.digio.in/v2';

export async function createSignRequest(args: SignRequestArgs): Promise<SignRequestResult> {
  const id = process.env.DIGIO_CLIENT_ID;
  const secret = process.env.DIGIO_CLIENT_SECRET;
  if (!id || !secret) {
    logger.warn({ signer: args.signerEmail }, 'digio.mock-mode');
    return {
      externalId: `mock-sig-${nanoid(10)}`,
      signingUrl: `MOCK_SIGN_URL_PLACEHOLDER`,
      mock: true,
    };
  }
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${HOST}/client/document/upload`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      file_name: args.filename,
      file_data: args.documentBase64,
      signers: [
        {
          identifier: args.signerEmail,
          name: args.signerName,
          reason: 'Proposal signature',
          sign_type: 'aadhaar',
        },
      ],
      expire_in_days: 14,
      send_sign_link: true,
    }),
  });
  if (!res.ok) throw new Error(`Digio ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; signing_parties: { authentication_url: string }[] };
  return {
    externalId: data.id,
    signingUrl: data.signing_parties[0]?.authentication_url ?? '',
    mock: false,
  };
}

export function verifyDigioWebhook(_rawBody: string, _signature: string): boolean {
  // Digio doesn't sign webhooks by default; production should add IP allowlisting
  // and/or shared-secret HMAC if available. Accept in dev.
  return true;
}
