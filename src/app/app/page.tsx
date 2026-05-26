import Link from 'next/link';
import {
  Database,
  FileText,
  Users,
  Wand2,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default async function DashboardHome() {
  const ctx = await requireContext();

  const [tableCount, rowCount, proposalCount, contactCount, totalValueAgg, recentProposals] =
    await Promise.all([
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
    ]);

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
        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Stat icon={Database} label="Catalog tables" value={tableCount} accent="#6366f1" />
          <Stat icon={Database} label="Catalog rows" value={rowCount} accent="#8b5cf6" />
          <Stat icon={Users} label="Clients" value={contactCount} accent="#ec4899" />
          <Stat
            icon={FileText}
            label="Proposals · total value"
            value={`${proposalCount} · ${formatCurrency(totalValueAgg._sum.total ?? 0, ctx.tenant.currency, ctx.tenant.locale)}`}
            accent="#10b981"
          />
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
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            {label}
          </div>
          <div className="text-lg font-semibold mt-0.5">{value}</div>
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
