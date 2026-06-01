import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { SchedulingManager } from './SchedulingManager';

export const dynamic = 'force-dynamic';

export default async function SchedulingPage() {
  const ctx = await requireContext();
  const [meetingTypes, rules, users] = await Promise.all([
    prisma.meetingType.findMany({ where: { tenantId: ctx.tenant.id, archived: false }, orderBy: { createdAt: 'asc' } }),
    prisma.availabilityRule.findMany({ where: { tenantId: ctx.tenant.id, userId: ctx.user.id }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.user.findMany({ where: { tenantId: ctx.tenant.id, status: 'ACTIVE' }, select: { id: true, fullName: true, email: true }, orderBy: { fullName: 'asc' } }),
  ]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1100px] p-6 md:p-10">
        <h1 className="text-3xl font-semibold">Scheduling</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Define the meetings clients can book and your weekly availability. Each meeting type gets its own public booking link.
        </p>
        <div className="mt-6">
          <SchedulingManager
            initialMeetingTypes={meetingTypes.map((m) => ({
              id: m.id, name: m.name, slug: m.slug, durationMins: m.durationMins, bufferMins: m.bufferMins,
              locationType: m.locationType, locationDetail: m.locationDetail, color: m.color,
              advanceNoticeHours: m.advanceNoticeHours, maxBookingDays: m.maxBookingDays,
              hostUserId: m.hostUserId, active: m.active,
            }))}
            initialRules={rules.map((r) => ({ dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }))}
            users={users}
            currentUserId={ctx.user.id}
          />
        </div>
      </div>
    </PageTransition>
  );
}
