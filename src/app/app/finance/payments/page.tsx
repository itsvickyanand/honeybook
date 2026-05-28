import Link from 'next/link';
import { CreditCard, ArrowDownRight } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatCurrency, timeAgo } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-300',
  SUCCESS: 'bg-emerald-500/20 text-emerald-300',
  FAILED: 'bg-red-500/20 text-red-300',
  REFUNDED: 'bg-slate-500/20 text-slate-300',
};

export default async function PaymentsTabPage() {
  const ctx = await requireContext();
  const payments = await prisma.payment.findMany({
    where: { tenantId: ctx.tenant.id },
    include: { invoice: { select: { number: true, total: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <h2 className="font-semibold flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-emerald-400" />
          All payments
          <span className="text-xs text-[var(--color-muted)] font-normal">({payments.length})</span>
        </h2>
      </div>
      {payments.length === 0 ? (
        <div className="p-10 text-center">
          <ArrowDownRight className="h-8 w-8 text-[var(--color-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--color-muted)]">
            No payments yet. They&apos;ll show here as soon as clients pay an invoice.
          </p>
        </div>
      ) : (
        <ul>
          {payments.map((p) => (
            <li
              key={p.id}
              className="px-5 py-3 border-b last:border-b-0 flex items-center justify-between hover:bg-[var(--color-surface-2)]/40"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {p.invoice?.number ? (
                    <Link href={`/app/invoices`} className="hover:underline">
                      Invoice {p.invoice.number}
                    </Link>
                  ) : (
                    'Direct payment'
                  )}
                </div>
                <div className="text-xs text-[var(--color-muted)] flex items-center gap-2 mt-0.5">
                  <span>{p.method}</span>
                  {p.provider && <span>· {p.provider}</span>}
                  {p.providerRef && <span className="font-mono">· {p.providerRef.slice(0, 16)}</span>}
                  <span>· {p.paidAt ? timeAgo(p.paidAt) : timeAgo(p.createdAt)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[p.status] ?? ''}`}>
                  {p.status}
                </span>
                <div className="text-sm font-semibold w-28 text-right">
                  {formatCurrency(p.amount, p.currency, ctx.tenant.locale)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
