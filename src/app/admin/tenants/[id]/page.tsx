/**
 * Tenant deep-dive — everything an admin needs to support, audit, or debug
 * a single customer in one place.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { ArrowLeft, ExternalLink, Mail, Phone, Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login');
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      businessType: true,
      _count: {
        select: {
          users: true, contacts: true, leads: true, projects: true,
          proposals: true, invoices: true, formSubmissions: true,
        },
      },
    },
  });
  if (!tenant) notFound();

  const day30 = new Date(Date.now() - 30 * 86400_000);

  const [
    users,
    integrations,
    paymentsAgg,
    paymentsThisMonth,
    openReceivables,
    recentLeads,
    recentProposals,
    recentPayments,
    recentActivity,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: id },
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.integration.findMany({
      where: { tenantId: id, scope: 'tenant' },
      orderBy: { provider: 'asc' },
    }),
    prisma.payment.aggregate({
      where: { tenantId: id, status: 'SUCCESS' },
      _count: { id: true }, _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: { tenantId: id, status: 'SUCCESS', paidAt: { gte: day30 } },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: {
        tenantId: id,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      _sum: { total: true, amountPaid: true },
    }),
    prisma.lead.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { contact: { select: { fullName: true, email: true } } },
    }),
    prisma.proposal.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.payment.findMany({
      where: { tenantId: id, status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      take: 6,
    }),
    prisma.activity.findMany({
      where: { tenantId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  const receivables = (openReceivables._sum.total ?? 0) - (openReceivables._sum.amountPaid ?? 0);
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> All tenants
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{tenant.name}</h1>
            <p className="text-sm text-slate-500">
              {tenant.businessType.name} · /{tenant.slug} · created {tenant.createdAt.toLocaleDateString()}
              {tenant.onboardingCompletedAt && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  Onboarded
                </span>
              )}
            </p>
          </div>
          <Link
            href={`/admin/db/tenant/${tenant.id}`}
            className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline"
          >
            View raw row <ExternalLink size={10} />
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={tenant._count.users} href={`/admin/db/user?tenant=${tenant.id}`} />
        <Stat label="Contacts" value={tenant._count.contacts} href={`/admin/db/contact?tenant=${tenant.id}`} />
        <Stat label="Leads" value={tenant._count.leads} href={`/admin/db/lead?tenant=${tenant.id}`} />
        <Stat label="Projects" value={tenant._count.projects} href={`/admin/db/project?tenant=${tenant.id}`} />
        <Stat label="Proposals" value={tenant._count.proposals} href={`/admin/db/proposal?tenant=${tenant.id}`} />
        <Stat label="Invoices" value={tenant._count.invoices} href={`/admin/db/invoice?tenant=${tenant.id}`} />
        <Stat label="Form submits" value={tenant._count.formSubmissions} href={`/admin/db/formSubmission?tenant=${tenant.id}`} />
        <Stat
          label="Lifetime revenue"
          value={paymentsAgg._count.id}
          sub={paymentsAgg._sum.amount ? fmt(paymentsAgg._sum.amount) : '₹0'}
        />
      </div>

      {/* Revenue + Integrations */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Revenue</h2>
          <div className="grid grid-cols-3 gap-4">
            <RevCell label="Last 30 days" amount={paymentsThisMonth._sum.amount ?? 0} />
            <RevCell label="Lifetime" amount={paymentsAgg._sum.amount ?? 0} />
            <RevCell label="Open receivables" amount={receivables} tone="amber" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Integrations</h2>
          {integrations.length === 0 ? (
            <p className="text-xs text-slate-500">Demo mode for everything — vendor hasn't connected any integration yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {integrations.map((i) => (
                <li key={i.id} className="flex items-center justify-between">
                  <span className="capitalize">{i.provider.replace(/_/g, ' ')}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      i.status === 'CONNECTED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {i.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Members */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Members ({users.length})</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/admin/db/user/${u.id}`} className="flex items-center gap-1 font-medium text-slate-900 hover:text-rose-600">
                      <Mail size={11} className="text-slate-400" /> {u.email}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{u.fullName}</td>
                  <td className="px-3 py-2">{u.role.name}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {u.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {u.phone}
                      </span>
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleDateString() : <span className="text-slate-300">never</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent rows */}
      <div className="grid gap-6 lg:grid-cols-3">
        <RecentList
          title="Recent leads"
          href={`/admin/db/lead?tenant=${tenant.id}`}
          items={recentLeads.map((l) => ({
            id: l.id,
            primary: l.title,
            secondary: l.contact?.fullName ?? l.contact?.email ?? l.source ?? '—',
            time: l.createdAt,
            link: `/admin/db/lead/${l.id}`,
          }))}
        />
        <RecentList
          title="Recent proposals"
          href={`/admin/db/proposal?tenant=${tenant.id}`}
          items={recentProposals.map((p) => ({
            id: p.id,
            primary: p.title,
            secondary: `${p.status} · ${fmt(p.total)}`,
            time: p.createdAt,
            link: `/admin/db/proposal/${p.id}`,
          }))}
        />
        <RecentList
          title="Recent payments"
          href={`/admin/db/payment?tenant=${tenant.id}`}
          items={recentPayments.map((p) => ({
            id: p.id,
            primary: fmt(p.amount),
            secondary: `${p.method} · ${p.status}`,
            time: p.paidAt ?? p.createdAt,
            link: `/admin/db/payment/${p.id}`,
          }))}
        />
      </div>

      {/* Activity */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent activity</h2>
        <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {recentActivity.length === 0 ? (
            <li className="p-4 text-sm text-slate-500">No activity yet.</li>
          ) : recentActivity.map((a) => (
            <li key={a.id} className="flex items-baseline justify-between border-b border-slate-100 px-4 py-2.5 text-sm last:border-0">
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-xs text-slate-500">{a.type}</div>
              </div>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar size={10} /> {a.createdAt.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label, value, sub, href,
}: {
  label: string; value: number; sub?: string; href?: string;
}) {
  const inner = (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-rose-300">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function RevCell({ label, amount, tone }: { label: string; amount: number; tone?: 'amber' }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>
        ₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}

function RecentList({
  title, href, items,
}: {
  title: string;
  href: string;
  items: { id: string; primary: string; secondary: string; time: Date; link: string }[];
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <Link href={href} className="text-xs text-rose-600 hover:underline">View all</Link>
      </div>
      <ul className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items.length === 0 ? (
          <li className="p-3 text-sm text-slate-500">None yet.</li>
        ) : items.map((it) => (
          <li key={it.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-0">
            <Link href={it.link} className="block hover:text-rose-600">
              <div className="truncate font-medium">{it.primary}</div>
              <div className="flex items-baseline justify-between text-xs text-slate-500">
                <span className="truncate">{it.secondary}</span>
                <span className="ml-2 whitespace-nowrap">{it.time.toLocaleDateString()}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
