import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ProposalEditor } from './ProposalEditor';
import { ProposalDoc } from '@/lib/proposal-schema';

export default async function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      events: { orderBy: { createdAt: 'desc' }, take: 20 },
      signatureRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
      invoices: { orderBy: { createdAt: 'desc' }, take: 1, include: { payments: true } },
    },
  });
  if (!proposal) notFound();

  const doc = proposal.contentJson as unknown as ProposalDoc;
  const aiIssues = (proposal.aiIssues as Array<{ severity: string; code: string; message: string; itemId?: string }> | null) ?? [];
  const signature = proposal.signatureRequests[0]
    ? {
        id: proposal.signatureRequests[0].id,
        status: proposal.signatureRequests[0].status,
        signedAt: proposal.signatureRequests[0].signedAt?.toISOString() ?? null,
      }
    : null;
  const invoiceSummary = proposal.invoices[0]
    ? {
        id: proposal.invoices[0].id,
        number: proposal.invoices[0].number,
        status: proposal.invoices[0].status,
        total: proposal.invoices[0].total,
        amountPaid: proposal.invoices[0].amountPaid,
      }
    : null;

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <Link
          href="/app/proposals"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to proposals
        </Link>
        <ProposalEditor
          proposalId={proposal.id}
          shareToken={proposal.shareToken}
          status={proposal.status}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
          taxLabel={ctx.tenant.taxLabel}
          initialDoc={doc}
          initialStatus={proposal.status}
          aiIssues={aiIssues}
          signature={signature}
          invoiceSummary={invoiceSummary}
          hasClientEmail={!!proposal.clientEmail}
          events={proposal.events.map((e) => ({
            id: e.id,
            type: e.type,
            actor: e.actor,
            payload: e.payload ?? null,
            createdAt: e.createdAt.toISOString(),
          }))}
        />
      </div>
    </PageTransition>
  );
}
