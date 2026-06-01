/**
 * Public: returns bookable slots for a meeting type.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeBookableSlots } from '@/lib/calendar/slots';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await prisma.meetingType.findFirst({ where: { slug, active: true, archived: false } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const days = await computeBookableSlots({
    durationMins: m.durationMins,
    bufferMins: m.bufferMins,
    advanceNoticeHours: m.advanceNoticeHours,
    maxBookingDays: m.maxBookingDays,
    hostUserId: m.hostUserId,
    tenantId: m.tenantId,
  });
  return NextResponse.json({
    meetingType: {
      name: m.name, durationMins: m.durationMins, locationType: m.locationType,
      description: m.description, color: m.color,
    },
    days,
  });
}
