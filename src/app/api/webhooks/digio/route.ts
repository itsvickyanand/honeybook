/**
 * Digio webhook → mark SignatureRequest as SIGNED.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyDigioWebhook } from '@/lib/esign/digio';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyDigioWebhook(raw, req.headers.get('x-digio-signature') ?? '')) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }
  let body: { event: string; doc_id?: string; signed_file_id?: string };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  if (body.event === 'document.signed' && body.doc_id) {
    await prisma.signatureRequest.updateMany({
      where: { externalId: body.doc_id },
      data: { status: 'SIGNED', signedAt: new Date() },
    });
  }
  return NextResponse.json({ ok: true });
}
