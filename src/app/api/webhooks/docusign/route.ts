/**
 * DocuSign Connect webhook → on envelope "completed", download the combined
 * signed PDF and store it. Accepts JSON Connect payloads.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downloadDocusignSigned } from '@/lib/esign/docusign';
import { storeSignedContract } from '@/lib/esign/store';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const raw = await req.text();
  let body: { event?: string; data?: { envelopeId?: string; envelopeSummary?: { status?: string } }; envelopeId?: string; status?: string };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const envelopeId = body.data?.envelopeId ?? body.envelopeId;
  const status = (body.data?.envelopeSummary?.status ?? body.status ?? body.event ?? '').toLowerCase();
  if (!envelopeId) return NextResponse.json({ ok: true });

  if (status.includes('complete')) {
    const sig = await prisma.signatureRequest.findFirst({ where: { externalId: envelopeId } });
    if (sig) {
      await prisma.signatureRequest.update({ where: { id: sig.id }, data: { status: 'SIGNED', signedAt: new Date() } });
      const pdf = await downloadDocusignSigned(envelopeId, sig.tenantId);
      if (pdf) {
        await storeSignedContract(sig.id, pdf, `agreement-${sig.id.slice(-8)}.pdf`)
          .catch((e) => logger.warn({ err: (e as Error).message }, 'docusign.store-failed'));
      }
    }
  }
  return NextResponse.json({ ok: true });
}
