/**
 * Mock signing confirm — marks the SignatureRequest SIGNED and, crucially,
 * generates a stamped "signed" PDF and stores it (same path a real provider
 * webhook would take), so the signed-contract artifact exists end-to-end even
 * without Digio/DocuSign credentials.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { htmlToPdf } from '@/lib/pdf/render';
import { storeSignedContract } from '@/lib/esign/store';
import { logger } from '@/lib/logger';

const schema = z.object({ requestId: z.string() });

export async function POST(req: Request) {
  if (process.env.DIGIO_CLIENT_ID || process.env.DOCUSIGN_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Mock sign disabled — a real provider is configured' }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const sig = await prisma.signatureRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!sig) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sig.status === 'SIGNED' && sig.signedFileId) return NextResponse.json({ ok: true, already: true });

  await prisma.signatureRequest.update({
    where: { id: sig.id },
    data: { status: 'SIGNED', signedAt: new Date() },
  });

  // Build a stamped signed PDF from the snapshotted contract HTML.
  try {
    const payload = (sig.payload ?? {}) as { contractHtml?: string };
    const base = payload.contractHtml ?? '<h1>Agreement</h1><p>Signed.</p>';
    const stamp = `<div class="sig">✔ Electronically signed by <strong>${sig.signerName}</strong> on ${new Date().toLocaleString('en-IN')} · Ref ${sig.id.slice(-8)} (sandbox eSign)</div>`;
    const signedHtml = base.replace('</body>', `${stamp}</body>`);
    const pdf = await htmlToPdf(signedHtml);
    await storeSignedContract(sig.id, pdf, `agreement-${sig.id.slice(-8)}.pdf`);
  } catch (e) {
    logger.warn({ err: (e as Error).message, sigId: sig.id }, 'mock-sign.store-failed');
  }

  return NextResponse.json({ ok: true });
}
