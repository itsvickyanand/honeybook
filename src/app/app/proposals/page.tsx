import Link from 'next/link';
import { FileText, Plus, Wand2 } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { formatCurrency, timeAgo } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  SENT: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  VIEWED: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  CHANGES_REQUESTED: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  ACCEPTED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  DECLINED: 'bg-red-500/20 text-red-300 border-red-500/40',
  EXPIRED: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

export default async function ProposalsPage() {
  const ctx = await requireContext();
  const proposals = await prisma.proposal.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { updatedAt: 'desc' },
    include: { contact: true, createdBy: true },
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Proposals</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              AI-curated proposals from your item master.
            </p>
          </div>
          <Link href="/app/proposals/new" className="btn-primary">
            <Wand2 className="h-4 w-4" /> Generate proposal
          </Link>
        </div>

        {proposals.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No proposals yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Generate your first one — describe the brief and the AI will draft it.
            </p>
            <Link href="/app/proposals/new" className="btn-primary mt-4 inline-flex">
              <Plus className="h-4 w-4" /> New proposal
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.id} className="border-t hover:bg-[var(--color-surface-2)]/50 transition">
                    <td className="px-4 py-3">
                      <Link href={`/app/proposals/${p.id}`} className="font-medium hover:text-[var(--color-primary-soft)]">
                        {p.title}
                      </Link>
                      <div className="text-xs text-[var(--color-muted)] mt-0.5">
                        v{p.currentVersion} · by {p.createdBy.fullName}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {p.contact?.fullName ?? p.clientName ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${STATUS_STYLES[p.status] ?? ''}`}>
                        {p.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(p.total, ctx.tenant.currency, ctx.tenant.locale)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{timeAgo(p.updatedAt)}</td>
                    <td className="px-4 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
