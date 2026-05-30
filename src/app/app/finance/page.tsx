/**
 * Finance Overview tab — at-a-glance financial state.
 * Pulls from existing models; no new schema.
 */
import Link from 'next/link';
import {
  TrendingUp,
  Wallet,
  CreditCard,
  Clock,
  AlertCircle,
  ArrowUpRight,
  Receipt,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default async function FinanceOverviewPage() {
  const ctx = await requireContext();
  const tenantId = ctx.tenant.id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [
    mtdRevenueAgg,
    ytdRevenueAgg,
    openInvoices,
    overdueInvoices,
    recentPayments,
    paymentsByMethod,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { tenantId, status: 'SUCCESS', paidAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: { tenantId, status: 'SUCCESS', paidAt: { gte: yearStart } },
      _sum: { amount: true },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      },
      select: { id: true, total: true, amountPaid: true, dueDate: true, number: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId, status: 'OVERDUE' },
      select: { id: true, total: true, amountPaid: true, dueDate: true, number: true },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    prisma.payment.findMany({
      where: { tenantId, status: 'SUCCESS' },
      include: { invoice: { select: { number: true, contactId: true } } },
      orderBy: { paidAt: 'desc' },
      take: 6,
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where: { tenantId, status: 'SUCCESS', paidAt: { gte: yearStart } },
      _sum: { amount: true },
    }),
  ]);

  const mtdRevenue = mtdRevenueAgg._sum.amount ?? 0;
  const ytdRevenue = ytdRevenueAgg._sum.amount ?? 0;
  const openReceivables = openInvoices.reduce((t, i) => t + (i.total - i.amountPaid), 0);
  const overdueAmount = overdueInvoices.reduce((t, i) => t + (i.total - i.amountPaid), 0);

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={TrendingUp}
          label="Revenue · MTD"
          value={formatCurrency(mtdRevenue, ctx.tenant.currency, ctx.tenant.locale)}
          accent="#10b981"
          hint={`${mtdRevenueAgg._count} payments this month`}
        />
        <KpiCard
          icon={Wallet}
          label="Revenue · YTD"
          value={formatCurrency(ytdRevenue, ctx.tenant.currency, ctx.tenant.locale)}
          accent="#6366f1"
        />
        <KpiCard
          icon={Clock}
          label="Open receivables"
          value={formatCurrency(openReceivables, ctx.tenant.currency, ctx.tenant.locale)}
          accent="#f59e0b"
          hint={`${openInvoices.length} invoices outstanding`}
        />
        <KpiCard
          icon={AlertCircle}
          label="Overdue"
          value={formatCurrency(overdueAmount, ctx.tenant.currency, ctx.tenant.locale)}
          accent="#ef4444"
          hint={
            overdueInvoices.length > 0
              ? `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? '' : 's'} late`
              : 'No overdue invoices'
          }
        />
      </div>

      {/* Two-column: recent payments + overdue list */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              Recent payments
            </h2>
            <Link
              href="/app/finance/payments"
              className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
            >
              All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              No payments received yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.invoice?.number ? `Invoice ${p.invoice.number}` : 'Direct payment'}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.method} · {p.paidAt ? timeAgo(p.paidAt) : 'pending'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-400 shrink-0">
                    +{formatCurrency(p.amount, p.currency, ctx.tenant.locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Overdue invoices
            </h2>
            <Link
              href="/app/finance/invoices"
              className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
            >
              All <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {overdueInvoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              Nothing overdue — nice.
            </p>
          ) : (
            <ul className="space-y-2">
              {overdueInvoices.map((i) => {
                const due = i.total - i.amountPaid;
                const daysLate = i.dueDate
                  ? Math.max(0, Math.floor((now.getTime() - i.dueDate.getTime()) / 86400000))
                  : 0;
                return (
                  <li
                    key={i.id}
                    className="flex items-center justify-between rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2.5"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {i.number ?? 'Draft invoice'}
                      </div>
                      <div className="text-xs text-amber-400">{daysLate} days late</div>
                    </div>
                    <div className="text-sm font-semibold text-amber-400 shrink-0">
                      {formatCurrency(due, ctx.tenant.currency, ctx.tenant.locale)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Payment methods breakdown */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Receipt className="h-4 w-4 text-[var(--color-primary)]" />
            Payments by method · YTD
          </h2>
        </div>
        {paymentsByMethod.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted)]">
            No payments this year yet.
          </p>
        ) : (
          <div className="space-y-2">
            {(() => {
              const total = paymentsByMethod.reduce((t, m) => t + (m._sum.amount ?? 0), 0) || 1;
              const sorted = [...paymentsByMethod].sort(
                (a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)
              );
              return sorted.map((m) => {
                const amount = m._sum.amount ?? 0;
                const pct = (amount / total) * 100;
                return (
                  <div key={m.method} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--color-muted)]">{m.method}</span>
                      <span className="font-medium">
                        {formatCurrency(amount, ctx.tenant.currency, ctx.tenant.locale)}{' '}
                        <span className="text-[var(--color-muted)]">· {pct.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <div className="relative">
        <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <span style={{ color: accent }} className="inline-flex">
            <Icon className="h-3.5 w-3.5" />
          </span>
          {label}
        </div>
        <div className="text-2xl font-semibold mt-1.5">{value}</div>
        {hint && <div className="text-xs text-[var(--color-muted)] mt-1">{hint}</div>}
      </div>
    </div>
  );
}
