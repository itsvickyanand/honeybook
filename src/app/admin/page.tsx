/**
 * Platform admin dashboard — rolled-up health, growth, and revenue.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import {
  TrendingUp, Building2, Users2, FileText, CreditCard,
  Activity, AlertTriangle, CheckCircle2, ArrowRight,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin');

  const now = new Date();
  const day7 = new Date(now.getTime() - 7 * 86400_000);
  const day30 = new Date(now.getTime() - 30 * 86400_000);

  const [
    tenantCount,
    userCount,
    tenantsThisWeek,
    activeTenantsThisWeek,
    proposalAgg,
    paymentAgg,
    paymentAgg7d,
    paymentAgg30d,
    invoiceOpen,
    integrations,
    signatureFailures,
    paymentFailures,
    submissionsThisWeek,
    recentTenants,
    recentSubmissions,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.tenant.count({ where: { createdAt: { gte: day7 } } }),
    prisma.tenant.count({ where: { users: { some: { lastLoginAt: { gte: day7 } } } } }),
    prisma.proposal.aggregate({ _count: { id: true }, _sum: { total: true } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCESS' },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: day7 } },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'SUCCESS', paidAt: { gte: day30 } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.integration.findMany({
      where: { scope: 'platform' },
      orderBy: { provider: 'asc' },
    }),
    prisma.signatureRequest.count({ where: { status: 'FAILED' } }),
    prisma.payment.count({ where: { status: 'FAILED', createdAt: { gte: day7 } } }),
    prisma.formSubmission.count({ where: { createdAt: { gte: day7 } } }),
    prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        _count: { select: { users: true, proposals: true, projects: true } },
        businessType: { select: { name: true } },
      },
    }),
    prisma.formSubmission.findMany({
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { form: { select: { name: true } }, tenant: { select: { name: true } } },
    }),
  ]);

  const openReceivables = (invoiceOpen._sum.total ?? 0) - (invoiceOpen._sum.amountPaid ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Platform-wide health, growth, and revenue.</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI
          icon={Building2}
          label="Tenants"
          value={tenantCount}
          sub={tenantsThisWeek > 0 ? `+${tenantsThisWeek} this week` : 'No new this week'}
          accent="rose"
        />
        <KPI
          icon={Users2}
          label="Users"
          value={userCount}
          sub={`${activeTenantsThisWeek} active tenants 7d`}
          accent="blue"
        />
        <KPI
          icon={FileText}
          label="Proposals"
          value={proposalAgg._count.id}
          sub={proposalAgg._sum.total ? `${formatINR(proposalAgg._sum.total)} pipeline` : undefined}
          accent="violet"
        />
        <KPI
          icon={CreditCard}
          label="Payments (lifetime)"
          value={paymentAgg._count.id}
          sub={paymentAgg._sum.amount ? formatINR(paymentAgg._sum.amount) : undefined}
          accent="emerald"
        />
      </div>

      {/* Revenue + health row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Revenue</h2>
            <Link href="/admin/db/payment" className="text-xs text-rose-600 hover:underline">
              View all payments <ArrowRight size={10} className="inline" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <RevCell label="Last 7 days" amount={paymentAgg7d._sum.amount ?? 0} />
            <RevCell label="Last 30 days" amount={paymentAgg30d._sum.amount ?? 0} />
            <RevCell label="Open receivables" amount={openReceivables} tone="amber" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Health</h2>
            <Activity size={14} className="text-slate-400" />
          </div>
          <ul className="space-y-2.5 text-sm">
            <HealthRow
              ok={signatureFailures === 0}
              label="Signature requests"
              detail={signatureFailures > 0 ? `${signatureFailures} failed` : 'All OK'}
            />
            <HealthRow
              ok={paymentFailures === 0}
              label="Payments (7d)"
              detail={paymentFailures > 0 ? `${paymentFailures} failed` : 'No failures'}
            />
            <HealthRow
              ok={true}
              label="Form submissions (7d)"
              detail={`${submissionsThisWeek} captured`}
            />
          </ul>
        </div>
      </div>

      {/* Recent tenants + Recent submissions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent tenants</h2>
            <Link href="/admin/tenants" className="text-xs text-rose-600 hover:underline">
              View all <ArrowRight size={10} className="inline" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Users</th>
                  <th className="px-3 py-2 text-right">Projects</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentTenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:text-rose-600">
                        {t.name}
                      </Link>
                      <div className="text-xs text-slate-500">{t.businessType.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{t._count.users}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t._count.projects}</td>
                    <td className="px-3 py-2 text-slate-600">{t.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Recent form submissions</h2>
            <Link href="/admin/db/formSubmission" className="text-xs text-rose-600 hover:underline">
              View all <ArrowRight size={10} className="inline" />
            </Link>
          </div>
          <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {recentSubmissions.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-500">No submissions yet.</li>
            ) : recentSubmissions.map((s) => (
              <li key={s.id} className="border-b border-slate-100 px-3 py-2.5 text-sm last:border-0">
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">{s.form.name}</div>
                  <div className="text-xs text-slate-500">{s.createdAt.toLocaleString()}</div>
                </div>
                <div className="text-xs text-slate-500">{s.tenant.name}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Platform integrations */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Platform integrations</h2>
          <Link href="/admin/integrations" className="text-xs text-rose-600 hover:underline">
            Manage <ArrowRight size={10} className="inline" />
          </Link>
        </div>
        {integrations.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No platform integrations connected. Tenants are running demo mode for everything.
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {integrations.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <div>
                  <div className="text-sm font-medium capitalize">{i.provider.replace(/_/g, ' ')}</div>
                  <div className="text-xs text-slate-500">{i.displayName ?? '—'}</div>
                </div>
                <StatusPill status={i.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function KPI({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: number;
  sub?: string;
  accent: 'rose' | 'blue' | 'violet' | 'emerald';
}) {
  const accents: Record<typeof accent, string> = {
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
    violet: 'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${accents[accent]}`}>
          <Icon size={18} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
        </div>
      </div>
      {sub && <div className="mt-2 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

function RevCell({ label, amount, tone }: { label: string; amount: number; tone?: 'amber' }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>
        {formatINR(amount)}
      </div>
    </div>
  );
}

function HealthRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
      )}
      <div className="flex-1">
        <div className="font-medium text-slate-700">{label}</div>
        <div className="text-xs text-slate-500">{detail}</div>
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'CONNECTED'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'ERROR'
      ? 'bg-rose-50 text-rose-700'
      : 'bg-slate-100 text-slate-600';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

// Avoid "TrendingUp unused" warning while reserving it for the next iteration.
void TrendingUp;
