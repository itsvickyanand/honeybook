import Link from 'next/link';
import {
  Database,
  FileText,
  Users,
  Wand2,
  ArrowUpRight,
  Sparkles,
  CreditCard,
  Activity as ActivityIcon,
  TrendingUp,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { IntegrationStatusCard } from '@/components/dashboard/IntegrationStatusCard';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default async function DashboardHome() {
  const ctx = await requireContext();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [
    tableCount,
    rowCount,
    proposalCount,
    contactCount,
    totalValueAgg,
    recentProposals,
    revenueThisMonthAgg,
    recentPayments,
    recentActivity,
    openReceivablesAgg,
  ] = await Promise.all([
    prisma.customTable.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.customRow.count({ where: { table: { tenantId: ctx.tenant.id } } }),
    prisma.proposal.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.contact.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.proposal.aggregate({
      where: { tenantId: ctx.tenant.id },
      _sum: { total: true },
    }),
    prisma.proposal.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { contact: true },
    }),
    prisma.payment.aggregate({
      where: { tenantId: ctx.tenant.id, status: 'SUCCESS', paidAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { tenantId: ctx.tenant.id, status: 'SUCCESS' },
      include: { invoice: { include: { proposal: { include: { contact: true } } } } },
      orderBy: { paidAt: 'desc' },
      take: 5,
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.invoice.findMany({
      where: { tenantId: ctx.tenant.id, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
      select: { total: true, amountPaid: true },
    }),
  ]);

  const revenueThisMonth = revenueThisMonthAgg._sum.amount ?? 0;
  const openReceivables = openReceivablesAgg.reduce((t, i) => t + (i.total - i.amountPaid), 0);

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        {/* Hero */}
        <div className="card p-8 mb-8 relative overflow-hidden">
          <div
            className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-20 blur-3xl"
            style={{ background: ctx.tenant.businessType.accentColor }}
          />
          <div className="relative">
            <div className="chip mb-3">
              <Sparkles className="h-3 w-3" />
              {ctx.tenant.businessType.name}
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold">
              Welcome, {ctx.user.fullName.split(' ')[0]}.
            </h1>
            <p className="mt-2 text-[var(--color-muted)]">
              You&apos;re running <strong>{ctx.tenant.name}</strong>. Build a proposal, manage
              your catalog, or onboard a new client — start anywhere.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/app/proposals/new" className="btn-primary">
                <Wand2 className="h-4 w-4" /> Generate proposal
              </Link>
              <Link href="/app/catalog" className="btn-secondary">
                <Database className="h-4 w-4" /> Manage item master
              </Link>
            </div>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Stat
            icon={TrendingUp}
            label="Revenue this month"
            value={formatCurrency(revenueThisMonth, ctx.tenant.currency, ctx.tenant.locale)}
            accent="#10b981"
          />
          <Stat
            icon={CreditCard}
            label="Open receivables"
            value={formatCurrency(openReceivables, ctx.tenant.currency, ctx.tenant.locale)}
            accent="#f59e0b"
          />
          <Stat icon={Users} label="Clients" value={contactCount} accent="#ec4899" />
          <Stat
            icon={FileText}
            label="Proposals · pipeline value"
            value={`${proposalCount} · ${formatCurrency(totalValueAgg._sum.total ?? 0, ctx.tenant.currency, ctx.tenant.locale)}`}
            accent="#8b5cf6"
          />
        </div>

        {/* Catalog stats — smaller now */}
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          <Stat icon={Database} label="Catalog tables" value={tableCount} accent="#6366f1" />
          <Stat icon={Database} label="Catalog rows" value={rowCount} accent="#8b5cf6" />
        </div>

        {/* Integration status */}
        <div className="mb-8">
          <IntegrationStatusCard />
        </div>

        {/* Recent payments + activity feed */}
        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-emerald-400" /> Recent payments
              </h2>
              <Link href="/app/invoices" className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1">
                Invoices <ArrowUpRight className="h-3 w-3" />
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
                    className="flex items-center justify-between rounded-xl border bg-[var(--color-surface-2)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {p.invoice?.proposal?.contact?.fullName ?? p.invoice?.proposal?.clientName ?? 'Client'}
                      </div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {p.method.replace('_', ' ').toLowerCase()} · {p.invoice?.number ?? '—'} · {p.paidAt ? timeAgo(p.paidAt) : 'pending'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-emerald-400">
                        +{formatCurrency(p.amount, ctx.tenant.currency, ctx.tenant.locale)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-[var(--color-primary-soft)]" /> Activity
              </h2>
            </div>
            {recentActivity.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-muted)]">
                No activity yet.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-[var(--color-primary-soft)]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[var(--color-text)] truncate">{a.title}</div>
                      <div className="text-xs text-[var(--color-muted)]">
                        {a.contact?.fullName ? `${a.contact.fullName} · ` : ''}{timeAgo(a.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Recent proposals */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent proposals</h2>
            <Link href="/app/proposals" className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentProposals.length === 0 ? (
            <EmptyProposals />
          ) : (
            <div className="space-y-2">
              {recentProposals.map((p) => (
                <Link
                  key={p.id}
                  href={`/app/proposals/${p.id}`}
                  className="flex items-center justify-between rounded-xl border bg-[var(--color-surface-2)] px-4 py-3 hover:border-[var(--color-primary)]/60 transition"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.contact?.fullName ?? p.clientName ?? 'No client'} · {timeAgo(p.updatedAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {formatCurrency(p.total, ctx.tenant.currency, ctx.tenant.locale)}
                    </div>
                    <span className="chip mt-1">{p.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-20 blur-2xl"
        style={{ background: accent }}
      />
      <div className="relative flex items-center gap-3">
        <div
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
          style={{ background: accent + '22', color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            {label}
          </div>
          <div className="text-lg font-semibold mt-0.5 truncate">{value}</div>
        </div>
      </div>
    </div>
  );
}

function EmptyProposals() {
  return (
    <div className="text-center py-10">
      <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-2)]">
        <FileText className="h-5 w-5 text-[var(--color-muted)]" />
      </div>
      <h3 className="font-medium">No proposals yet</h3>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Generate your first one — the AI will use your item master as context.
      </p>
      <Link href="/app/proposals/new" className="btn-primary mt-4 inline-flex">
        <Wand2 className="h-4 w-4" /> Generate proposal
      </Link>
    </div>
  );
}
