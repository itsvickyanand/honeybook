import Link from 'next/link';
import { Bell } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { timeAgo } from '@/lib/utils';
import { NotificationsActions } from './NotificationsActions';

export default async function NotificationsPage() {
  const ctx = await requireContext();
  const items = await prisma.notification.findMany({
    where: { tenantId: ctx.tenant.id, OR: [{ userId: null }, { userId: ctx.user.id }] },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Notifications</h1>
            <p className="mt-1 text-[var(--color-muted)]">Recent activity across your workspace.</p>
          </div>
          <NotificationsActions />
        </div>
        {items.length === 0 ? (
          <div className="card p-12 text-center">
            <Bell className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No notifications yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              When a client views a proposal or pays an invoice, you&apos;ll see it here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <Link
                key={n.id}
                href={n.href ?? '#'}
                className={`block card p-4 hover:border-[var(--color-primary)]/60 transition ${
                  n.readAt ? '' : 'border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`inline-block h-2 w-2 mt-1.5 rounded-full ${n.readAt ? 'bg-[var(--color-muted)]' : 'bg-[var(--color-primary-soft)]'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{n.title}</div>
                    {n.body && <p className="mt-0.5 text-sm text-[var(--color-muted)]">{n.body}</p>}
                    <div className="mt-1 text-xs text-[var(--color-muted)]">{timeAgo(n.createdAt)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
