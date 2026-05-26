import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ProposalDoc } from '@/lib/proposal-schema';
import { ClientPortal } from './ClientPortal';

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: { include: { businessType: true } } },
  });
  if (!p) notFound();

  // Record VIEWED on first server render after SENT
  if (p.status === 'SENT') {
    await prisma.proposal.update({ where: { id: p.id }, data: { status: 'VIEWED' } });
    await prisma.proposalEvent.create({
      data: { proposalId: p.id, type: 'VIEWED', actor: 'client' },
    });
  }

  const doc = p.contentJson as unknown as ProposalDoc;

  return (
    <ClientPortal
      token={token}
      initialDoc={doc}
      status={p.status === 'SENT' ? 'VIEWED' : p.status}
      currency={p.tenant.currency}
      locale={p.tenant.locale}
      taxLabel={p.tenant.taxLabel}
      vendor={{
        name: p.tenant.name,
        brandColor: p.tenant.brandColor,
        businessType: p.tenant.businessType.name,
        accentColor: p.tenant.businessType.accentColor,
      }}
    />
  );
}
