import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TenantsPage() {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin/tenants');

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { users: true, proposals: true, projects: true, invoices: true } },
      businessType: { select: { name: true, slug: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenants</h1>
        <p className="text-sm text-slate-600">{tenants.length} total.</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Slug</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2 text-right">Users</th>
              <th className="px-3 py-2 text-right">Proposals</th>
              <th className="px-3 py-2 text-right">Projects</th>
              <th className="px-3 py-2 text-right">Invoices</th>
              <th className="px-3 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:text-rose-600">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-slate-600">{t.slug}</td>
                <td className="px-3 py-2 text-slate-600">{t.businessType.name}</td>
                <td className="px-3 py-2 text-slate-600">{t.region}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t._count.users}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t._count.proposals}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t._count.projects}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t._count.invoices}</td>
                <td className="px-3 py-2 text-slate-600">{t.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
