/**
 * Public portal status endpoint. Used by the client portal to refresh
 * after a pay/sign redirect — returns proposal status, signature state,
 * and the latest invoice (if any).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await prisma.proposal.findUnique({
    where: { shareToken: token },
    select: { id: true, status: true, total: true },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [signature, invoice] = await Promise.all([
    prisma.signatureRequest.findFirst({
      where: { proposalId: proposal.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, signedAt: true },
    }),
    prisma.invoice.findFirst({
      where: { proposalId: proposal.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, number: true, total: true, amountPaid: true },
    }),
  ]);

  return NextResponse.json({
    proposal: { status: proposal.status, total: proposal.total },
    signature: signature ?? null,
    invoice: invoice ?? null,
  });
}
