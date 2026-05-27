import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { CalendarClient } from './CalendarClient';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await requireContext();
  const { month } = await searchParams;

  const now = month ? new Date(month + 'T00:00:00') : new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Pad to full weeks
  const rangeStart = new Date(monthStart);
  rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
  const rangeEnd = new Date(monthEnd);
  if (rangeEnd.getDay() !== 0) rangeEnd.setDate(rangeEnd.getDate() + (7 - rangeEnd.getDay()));

  const events = await prisma.calendarEvent.findMany({
    where: {
      tenantId: ctx.tenant.id,
      startAt: { lt: rangeEnd },
      endAt: { gte: rangeStart },
    },
    orderBy: { startAt: 'asc' },
  });

  const googleConnected = !!(await prisma.accountingConnection.findFirst({
    where: { tenantId: ctx.tenant.id, provider: 'google_calendar', status: 'CONNECTED' },
  }));

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <CalendarClient
          monthIso={monthStart.toISOString().slice(0, 10)}
          googleConnected={googleConnected}
          events={events.map((e) => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt.toISOString(),
            endAt: e.endAt.toISOString(),
            allDay: e.allDay,
            type: e.type,
            location: e.location,
            externalId: e.externalId,
          }))}
        />
      </div>
    </PageTransition>
  );
}
