/**
 * Audit log viewer — combines PlatformAuditLog (admin actions) and AuditLog
 * (tenant actions) into a single timeline with filters.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { Search, ScrollText } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    source?: string;
    entity?: string;
    action?: string;
    tenant?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin/audit');

  const sp = await searchParams;
  const source = sp.source ?? 'all'; // 'platform' | 'tenant' | 'all'
  const entityFilter = sp.entity ?? '';
  const actionFilter = sp.action ?? '';
  const tenantFilter = sp.tenant ?? '';
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  // ── Build the two queries; merge results in memory for the "all" view ─
  type Row = {
    id: string;
    when: Date;
    sourceLabel: 'PLATFORM' | 'TENANT';
    actor: string;
    action: string;
    entity: string | null;
    entityId: string | null;
    tenantId: string | null;
    tenantName: string | null;
  };

  const platformWhere: Record<string, unknown> = {};
  const tenantWhere: Record<string, unknown> = {};
  if (entityFilter) {
    platformWhere.entity = entityFilter;
    tenantWhere.entity = entityFilter;
  }
  if (actionFilter) {
    platformWhere.action = { contains: actionFilter, mode: 'insensitive' as const };
    tenantWhere.action = { contains: actionFilter, mode: 'insensitive' as const };
  }
  if (q) {
    platformWhere.OR = [
      { action: { contains: q, mode: 'insensitive' as const } },
      { entityId: { contains: q } },
    ];
    tenantWhere.OR = [
      { action: { contains: q, mode: 'insensitive' as const } },
      { entityId: { contains: q } },
    ];
  }
  if (tenantFilter) {
    tenantWhere.tenantId = tenantFilter;
  }

  // For pagination math we overfetch then sort+slice. Fine for a few thousand rows.
  const wantPlatform = source !== 'tenant';
  const wantTenant = source !== 'platform' && (!tenantFilter || true);

  type PlatRow = { id: string; action: string; entity: string | null; entityId: string | null; createdAt: Date; admin: { email: string } | null };
  type TenantRow = { id: string; action: string; entity: string; entityId: string | null; createdAt: Date; userId: string | null; tenantId: string; tenant: { id: string; name: string } };
  const [platformRows, tenantRows, tenants, totalPlat, totalTenant] = await Promise.all([
    wantPlatform
      ? (prisma.platformAuditLog.findMany({
          where: platformWhere,
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: { admin: { select: { email: true } } },
        }) as unknown as Promise<PlatRow[]>)
      : Promise.resolve([] as PlatRow[]),
    wantTenant
      ? (prisma.auditLog.findMany({
          where: tenantWhere,
          orderBy: { createdAt: 'desc' },
          take: 500,
          include: { tenant: { select: { id: true, name: true } } },
        }) as unknown as Promise<TenantRow[]>)
      : Promise.resolve([] as TenantRow[]),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    wantPlatform ? prisma.platformAuditLog.count({ where: platformWhere }) : Promise.resolve(0),
    wantTenant ? prisma.auditLog.count({ where: tenantWhere }) : Promise.resolve(0),
  ]);

  const merged: Row[] = [];
  for (const r of platformRows) {
    merged.push({
      id: `p_${r.id}`,
      when: r.createdAt,
      sourceLabel: 'PLATFORM',
      actor: r.admin?.email ?? '(system)',
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      tenantId: null,
      tenantName: null,
    });
  }
  for (const r of tenantRows) {
    merged.push({
      id: `t_${r.id}`,
      when: r.createdAt,
      sourceLabel: 'TENANT',
      actor: r.userId ?? '—',
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
    });
  }
  merged.sort((a, b) => b.when.getTime() - a.when.getTime());
  const total = totalPlat + totalTenant;
  const rows = merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(merged.length / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <ScrollText size={20} /> Audit log
        </h1>
        <p className="text-sm text-slate-600">
          Combined platform + tenant audit. Showing the most recent {merged.length.toLocaleString()} of {total.toLocaleString()} matched rows.
        </p>
      </div>

      <form method="GET" action="/admin/audit" className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search" name="q" defaultValue={q}
            placeholder="Search action or entity id…"
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <select name="source" defaultValue={source} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="all">All sources</option>
          <option value="platform">Platform only</option>
          <option value="tenant">Tenant only</option>
        </select>
        <input
          name="entity" defaultValue={entityFilter} placeholder="Entity (e.g. Proposal)"
          className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
        <input
          name="action" defaultValue={actionFilter} placeholder="Action contains…"
          className="w-40 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        />
        <select name="tenant" defaultValue={tenantFilter} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
          Apply
        </button>
        {(q || entityFilter || actionFilter || tenantFilter || source !== 'all') && (
          <Link href="/admin/audit" className="text-xs text-slate-500 hover:underline">Clear</Link>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 w-32">When</th>
              <th className="px-3 py-2 w-20">Source</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Tenant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-500">No audit rows match.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 text-xs text-slate-500">
                  {r.when.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.sourceLabel === 'PLATFORM'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {r.sourceLabel}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{r.actor}</td>
                <td className="px-3 py-2"><code className="font-mono text-xs">{r.action}</code></td>
                <td className="px-3 py-2 text-xs">
                  {r.entity ?? <span className="text-slate-300">—</span>}
                  {r.entityId && (
                    <div className="font-mono text-[11px] text-slate-500">{r.entityId}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.tenantId && r.tenantName ? (
                    <Link href={`/admin/tenants/${r.tenantId}`} className="text-rose-600 hover:underline">
                      {r.tenantName}
                    </Link>
                  ) : <span className="text-slate-300">—</span>}
                </td>
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
              href={pageUrl({ q, source, entity: entityFilter, action: actionFilter, tenant: tenantFilter }, page - 1)}
              disabled={page === 1}
            >Prev</PageLink>
            <PageLink
              href={pageUrl({ q, source, entity: entityFilter, action: actionFilter, tenant: tenantFilter }, page + 1)}
              disabled={page === totalPages}
            >Next</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function pageUrl(filters: Record<string, string>, p: number): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v && v !== 'all') params.set(k, v);
  if (p > 1) params.set('page', String(p));
  const qs = params.toString();
  return qs ? `/admin/audit?${qs}` : '/admin/audit';
}

function PageLink({ href, disabled, children }: { href: string; disabled?: boolean; children: React.ReactNode }) {
  if (disabled) return <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-400">{children}</span>;
  return <Link href={href} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">{children}</Link>;
}
