/**
 * Platform admin overview — tenant + revenue + integration health rollup.
 */
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin');

  const [tenantCount, userCount, proposalAgg, paymentAgg, integrations] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.proposal.aggregate({ _count: { id: true }, _sum: { total: true } }),
    prisma.payment.aggregate({
      where: { status: 'SUCCESS' },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.integration.findMany({
      where: { scope: 'platform' },
      orderBy: { provider: 'asc' },
    }),
  ]);

  const recentTenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: {
      _count: { select: { users: true, proposals: true, projects: true } },
      businessType: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-600">Platform-wide rollup.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KPI label="Tenants" value={tenantCount} />
        <KPI label="Users" value={userCount} />
        <KPI label="Proposals" value={proposalAgg._count.id} sub={proposalAgg._sum.total ? `₹${proposalAgg._sum.total.toLocaleString('en-IN')} total` : undefined} />
        <KPI
          label="Payments captured"
          value={paymentAgg._count.id}
          sub={paymentAgg._sum.amount ? `₹${paymentAgg._sum.amount.toLocaleString('en-IN')}` : undefined}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent tenants</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2 text-right">Proposals</th>
                <th className="px-3 py-2 text-right">Projects</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentTenants.map((t) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-slate-600">{t.businessType.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t._count.users}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t._count.proposals}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t._count.projects}</td>
                  <td className="px-3 py-2 text-slate-600">{t.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Platform integrations</h2>
        {integrations.length === 0 ? (
          <p className="text-sm text-slate-500">
            None connected yet. <a className="text-rose-600 hover:underline" href="/admin/integrations">Set up →</a>
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {integrations.map((i) => (
              <li key={i.id} className="flex items-center justify-between px-3 py-2">
                <div>
                  <div className="font-medium">{i.provider}</div>
                  <div className="text-xs text-slate-500">{i.displayName ?? '—'}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    i.status === 'CONNECTED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : i.status === 'ERROR'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KPI({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
