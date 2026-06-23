/**
 * Cross-tenant users page. Search any user by email/name/phone, see their
 * tenant + role + last login. Click to drill into the row detail.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { Search, Users2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tenant?: string; page?: string }>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin/users');

  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const tenantFilter = sp.tenant ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: 'insensitive' as const } },
      { fullName: { contains: q, mode: 'insensitive' as const } },
      { phone: { contains: q } },
    ];
  }
  if (tenantFilter) where.tenantId = tenantFilter;

  const [users, total, tenants] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        role: { select: { name: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Users2 size={20} /> Users
        </h1>
        <p className="text-sm text-slate-600">
          {total.toLocaleString()} user{total === 1 ? '' : 's'} across all tenants.
        </p>
      </div>

      <form method="GET" action="/admin/users" className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by email, name, phone…"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <select
          name="tenant"
          defaultValue={tenantFilter}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          Apply
        </button>
        {(q || tenantFilter) && (
          <Link href="/admin/users" className="text-xs text-slate-500 hover:underline">Clear</Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Last login</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">No users match.</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/db/user/${u.id}`} className="font-medium text-slate-900 hover:text-rose-600">
                    {u.email}
                  </Link>
                  {u.phone && <div className="text-[11px] text-slate-500">{u.phone}</div>}
                </td>
                <td className="px-3 py-2">{u.fullName || <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2">
                  <Link href={`/admin/tenants/${u.tenantId}`} className="text-rose-600 hover:underline">
                    {u.tenant.name}
                  </Link>
                  <div className="text-[11px] text-slate-500">/{u.tenant.slug}</div>
                </td>
                <td className="px-3 py-2">{u.role.name}</td>
                <td className="px-3 py-2 text-slate-500">
                  {u.lastLoginAt
                    ? u.lastLoginAt.toLocaleDateString()
                    : <span className="text-slate-300">never</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{u.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-500">Page {page} of {totalPages}</div>
          <div className="flex gap-1">
            <PageLink
              href={pageUrl(q, tenantFilter, page - 1)}
              disabled={page === 1}
            >Prev</PageLink>
            <PageLink
              href={pageUrl(q, tenantFilter, page + 1)}
              disabled={page === totalPages}
            >Next</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function pageUrl(q: string, tenant: string, p: number): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tenant) params.set('tenant', tenant);
  if (p > 1) params.set('page', String(p));
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : '/admin/users';
}

function PageLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-400">{children}</span>;
  return <Link href={href} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">{children}</Link>;
}
