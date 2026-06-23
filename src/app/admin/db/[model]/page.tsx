/**
 * Admin DB browser — list view for a single model.
 * Generic across all 30+ registered models. Pagination + search.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { getModel, type ColumnSpec } from '@/lib/admin/model-registry';
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

type Search = { q?: string; page?: string; tenant?: string };

export default async function AdminModelListPage({
  params,
  searchParams,
}: {
  params: Promise<{ model: string }>;
  searchParams: Promise<Search>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login');
  const { model: modelKey } = await params;
  const sp = await searchParams;
  const spec = getModel(modelKey);
  if (!spec) notFound();

  const q = (sp.q ?? '').trim();
  const tenantFilter = sp.tenant ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  // ── Build the where clause from search + tenant filter ─────────────
  // We use Prisma's `mode: 'insensitive'` for case-insensitive matches.
  const where: Record<string, unknown> = {};
  if (q && spec.searchCols.length) {
    where.OR = spec.searchCols.map((col) => ({
      [col]: { contains: q, mode: 'insensitive' as const },
    }));
  }
  if (tenantFilter && spec.tenantCol) {
    where[spec.tenantCol] = tenantFilter;
  }

  // ── Build select with only the displayed columns + id ─────────────
  const select: Record<string, true> = { id: true };
  for (const c of spec.listCols) select[c.key] = true;
  if (spec.primaryCol !== 'id') select[spec.primaryCol] = true;
  if (spec.subTitleCol) select[spec.subTitleCol] = true;

  const orderBy = spec.defaultSort
    ? { [spec.defaultSort.col]: spec.defaultSort.dir }
    : { id: 'desc' as const };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[spec.key];
  if (!delegate) notFound();

  const [rows, total, tenants] = await Promise.all([
    delegate.findMany({
      where,
      select,
      orderBy,
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    delegate.count({ where }),
    spec.showsTenantFilter
      ? prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/db"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> All tables
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{spec.label}</h1>
        <p className="text-sm text-slate-500">{total.toLocaleString()} row{total === 1 ? '' : 's'}</p>
      </div>

      {/* Toolbar */}
      <form
        method="GET"
        action={`/admin/db/${spec.key}`}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative max-w-sm flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder={
              spec.searchCols.length
                ? `Search ${spec.searchCols.join(', ')}…`
                : 'Search not available on this table'
            }
            disabled={!spec.searchCols.length}
            className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        {spec.showsTenantFilter && (
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
        )}
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
        >
          Apply
        </button>
        {(q || tenantFilter) && (
          <Link href={`/admin/db/${spec.key}`} className="text-xs text-slate-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No rows match.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
              <tr>
                {spec.listCols.map((c) => (
                  <th key={c.key} className={`px-3 py-2 ${c.width ?? ''}`}>
                    {c.label ?? c.key}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(rows as Record<string, unknown>[]).map((row) => (
                <tr key={String(row.id)} className="hover:bg-slate-50">
                  {spec.listCols.map((c) => (
                    <td key={c.key} className={`px-3 py-2 ${c.width ?? ''}`}>
                      {renderCell(row[c.key], c)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/db/${spec.key}/${row.id}`}
                      className="text-xs font-medium text-rose-600 hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        baseUrl={`/admin/db/${spec.key}`}
        searchParams={sp}
      />
    </div>
  );
}

function renderCell(value: unknown, col: ColumnSpec): React.ReactNode {
  if (value === null || value === undefined) return <span className="text-slate-300">—</span>;
  if (col.type === 'boolean') {
    return value
      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">true</span>
      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">false</span>;
  }
  if (col.type === 'date' && value instanceof Date) {
    return <span className="whitespace-nowrap text-slate-700">{value.toLocaleString()}</span>;
  }
  if (col.type === 'number' && typeof value === 'number') {
    return <span className="tabular-nums">{value.toLocaleString()}</span>;
  }
  if (col.type === 'json') {
    return (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
        {JSON.stringify(value).slice(0, 60)}…
      </code>
    );
  }
  // String / ref / enum / default — truncate long ones
  const str = String(value);
  return <span className="block max-w-xs truncate" title={str}>{str}</span>;
}

function Pagination({
  page, totalPages, baseUrl, searchParams,
}: {
  page: number; totalPages: number; baseUrl: string; searchParams: Search;
}) {
  if (totalPages <= 1) return null;
  function url(p: number) {
    const params = new URLSearchParams();
    if (searchParams.q) params.set('q', searchParams.q);
    if (searchParams.tenant) params.set('tenant', searchParams.tenant);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${baseUrl}?${qs}` : baseUrl;
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="text-slate-500">Page {page} of {totalPages}</div>
      <div className="flex gap-1">
        <PageLink href={url(page - 1)} disabled={page === 1}>
          <ChevronLeft size={14} /> Prev
        </PageLink>
        <PageLink href={url(page + 1)} disabled={page === totalPages}>
          Next <ChevronRight size={14} />
        </PageLink>
      </div>
    </div>
  );
}

function PageLink({
  href, disabled, children,
}: {
  href: string; disabled?: boolean; children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-slate-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
