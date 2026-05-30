import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { formatCurrency, timeAgo } from '@/lib/utils';

const TONE: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  VIEWED: 'bg-purple-500/20 text-purple-300',
  PARTIALLY_PAID: 'bg-amber-500/20 text-amber-300',
  PAID: 'bg-emerald-500/20 text-emerald-300',
  OVERDUE: 'bg-red-500/20 text-red-300',
  VOID: 'bg-slate-500/10 text-slate-400',
};

export default async function InvoicesPage() {
  const ctx = await requireContext();
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
    include: { proposal: true },
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Invoices</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              GST-compliant invoicing with concurrency-safe numbering.
            </p>
          </div>
          <Link href="/app/invoices/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New invoice
          </Link>
        </div>

        {invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <Receipt className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No invoices yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Convert a proposal to an invoice when the client accepts.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Number</th>
                  <th className="px-4 py-3">Proposal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t hover:bg-[var(--color-surface-2)]/50 transition">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/app/invoices/${inv.id}`} className="hover:text-[var(--color-primary-soft)]">
                        {inv.number ?? <span className="text-[var(--color-muted)]">— (draft)</span>}
                      </Link>
                      <div className="text-xs text-[var(--color-muted)]">{inv.type.toLowerCase().replace('_', ' ')}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{inv.proposal?.title ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${TONE[inv.status] ?? ''}`}>{inv.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(inv.total, ctx.tenant.currency, ctx.tenant.locale)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(inv.amountPaid, ctx.tenant.currency, ctx.tenant.locale)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{timeAgo(inv.updatedAt)}</td>
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
