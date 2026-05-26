/**
 * Public endpoint — no auth. Returns proposal by shareToken.
 * Records a VIEWED event on first fetch after status=SENT.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ProposalDoc } from '@/lib/proposal-schema';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: { include: { businessType: true } } },
  });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Record VIEWED once
  if (p.status === 'SENT') {
    await prisma.proposal.update({ where: { id: p.id }, data: { status: 'VIEWED' } });
    await prisma.proposalEvent.create({
      data: { proposalId: p.id, type: 'VIEWED', actor: 'client' },
    });
  }

  const doc = p.contentJson as unknown as ProposalDoc;
  return NextResponse.json({
    proposal: {
      id: p.id,
      title: p.title,
      status: p.status,
      clientName: p.clientName,
      currency: p.tenant.currency,
      locale: p.tenant.locale,
      taxLabel: p.tenant.taxLabel,
      content: doc,
      vendor: {
        name: p.tenant.name,
        brandColor: p.tenant.brandColor,
        businessType: p.tenant.businessType.name,
      },
    },
  });
}
