/**
 * Digio webhook → mark SignatureRequest SIGNED and download + store the signed PDF.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyDigioWebhook, downloadDigioSigned } from '@/lib/esign/digio';
import { storeSignedContract } from '@/lib/esign/store';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyDigioWebhook(raw, req.headers.get('x-digio-signature') ?? '')) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: { event: string; doc_id?: string };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  if (body.event === 'document.signed' && body.doc_id) {
    const sig = await prisma.signatureRequest.findFirst({ where: { externalId: body.doc_id } });
    if (sig) {
      await prisma.signatureRequest.update({ where: { id: sig.id }, data: { status: 'SIGNED', signedAt: new Date() } });
      const pdf = await downloadDigioSigned(body.doc_id, sig.tenantId);
      if (pdf) {
        await storeSignedContract(sig.id, pdf, `agreement-${sig.id.slice(-8)}.pdf`)
          .catch((e) => logger.warn({ err: (e as Error).message }, 'digio.store-failed'));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
