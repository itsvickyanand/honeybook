import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { DiffView } from './DiffView';
import type { ProposalDoc } from '@/lib/proposal-schema';

export default async function ChangesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: { versions: { orderBy: { version: 'asc' } } },
  });
  if (!proposal) notFound();
  // Find the previous vendor-authored version and the latest client-authored.
  const versions = proposal.versions;
  const lastClient = [...versions].reverse().find((v) => v.authoredBy === 'client');
  const lastVendor = lastClient
    ? [...versions].reverse().find((v) => v.authoredBy !== 'client' && v.version < lastClient.version)
    : null;

  if (!lastClient) {
    return (
      <PageTransition>
        <div className="p-10 text-center text-[var(--color-muted)]">
          No client change request found.
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <Link
          href={`/app/proposals/${id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to proposal
        </Link>
        <DiffView
          proposalId={proposal.id}
          before={(lastVendor?.contentJson ?? proposal.versions[0].contentJson) as unknown as ProposalDoc}
          after={lastClient.contentJson as unknown as ProposalDoc}
          note={lastClient.note ?? null}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
