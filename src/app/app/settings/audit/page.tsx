import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { timeAgo } from '@/lib/utils';

export default async function AuditPage() {
  const ctx = await requireContext();
  const items = await prisma.auditLog.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const userIds = [...new Set(items.map((i) => i.userId).filter(Boolean) as string[])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } } });
  const userMap = new Map(users.map((u) => [u.id, u.fullName]));

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold">Audit log</h1>
        <p className="mt-1 text-[var(--color-muted)]">Every write to your workspace, last 200 events.</p>
        <div className="mt-6 card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wider text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Who</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Entity</th>
                <th className="px-4 py-3 text-left">IP</th>
                <th className="px-4 py-3 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2">{it.userId ? (userMap.get(it.userId) ?? '—') : 'system'}</td>
                  <td className="px-4 py-2"><span className="chip text-xs">{it.action}</span></td>
                  <td className="px-4 py-2">
                    {it.entity}
                    {it.entityId && <span className="text-[var(--color-muted)] ml-1">#{it.entityId.slice(-8)}</span>}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{it.ip ?? '—'}</td>
                  <td className="px-4 py-2 text-[var(--color-muted)]">{timeAgo(it.createdAt)}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-[var(--color-muted)]">No audit events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageTransition>
  );
}
