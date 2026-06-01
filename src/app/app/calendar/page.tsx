import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { CalendarClient } from './CalendarClient';

export const dynamic = 'force-dynamic';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; project?: string }>;
}) {
  const ctx = await requireContext();
  const { month, project: projectFilter } = await searchParams;

  const now = month ? new Date(month + 'T00:00:00') : new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Lightweight project + contact lists for the filter chip + the new-event picker.
  const [projects, contacts] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, name: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.contact.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
      take: 200,
    }),
  ]);

  const googleConnected = !!(await prisma.integration.findFirst({
    where: { provider: 'google_calendar', userId: ctx.user.id, status: 'CONNECTED' },
  }).catch(() => null));

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <CalendarClient
          monthIso={monthStart.toISOString().slice(0, 10)}
          googleConnected={googleConnected}
          projects={projects}
          contacts={contacts}
          initialProjectId={projectFilter ?? null}
          currentUserId={ctx.user.id}
        />
      </div>
    </PageTransition>
  );
}
