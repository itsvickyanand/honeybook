/**
 * Public endpoint — client initiates signature on the proposal/contract.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSignRequest } from '@/lib/esign/digio';
import { renderProposalHtml } from '@/lib/pdf/proposal-template';

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: true },
  });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!p.clientName) return NextResponse.json({ error: 'Client name missing' }, { status: 400 });

  // Generate the document (HTML in dev; a real PDF renderer hooks in here)
  const html = renderProposalHtml(p);
  const base64 = Buffer.from(html, 'utf8').toString('base64');

  const result = await createSignRequest({
    signerName: p.clientName,
    signerEmail: p.clientEmail ?? `${p.id}@no-email.demo`,
    documentBase64: base64,
    filename: `${p.title}.html`,
  });

  const sig = await prisma.signatureRequest.create({
    data: {
      tenantId: p.tenantId,
      proposalId: p.id,
      provider: 'digio',
      externalId: result.externalId,
      signerName: p.clientName,
      signerEmail: p.clientEmail ?? '',
      status: result.mock ? 'PENDING' : 'SENT',
    },
  });

  // In mock mode the adapter returns a placeholder; substitute the real
  // SignatureRequest id + back URL now that we know them.
  const back = `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}`;
  const signUrl = result.mock
    ? `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-sign?ref=${sig.id}&back=${encodeURIComponent(back)}`
    : result.signingUrl;

  return NextResponse.json({ signUrl, requestId: sig.id });
}
