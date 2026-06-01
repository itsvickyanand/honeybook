/**
 * Manage a booking by its token: GET details, POST reschedule/cancel.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await prisma.calendarEvent.findFirst({
    where: { bookingToken: token },
    include: { meetingType: { select: { name: true, slug: true, durationMins: true } }, contact: { select: { fullName: true, email: true } } },
  });
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    title: ev.title,
    startAt: ev.startAt.toISOString(),
    endAt: ev.endAt.toISOString(),
    status: ev.status,
    meetingType: ev.meetingType,
    contact: ev.contact,
  });
}

const schema = z.object({
  action: z.enum(['cancel', 'reschedule']),
  startAt: z.string().datetime().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await prisma.calendarEvent.findFirst({ where: { bookingToken: token }, include: { meetingType: { select: { durationMins: true } } } });
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.action === 'cancel') {
    await prisma.calendarEvent.update({ where: { id: ev.id }, data: { status: 'CANCELLED' } });
    return NextResponse.json({ ok: true });
  }
  // reschedule
  if (!parsed.data.startAt) return NextResponse.json({ error: 'startAt required' }, { status: 400 });
  const start = new Date(parsed.data.startAt);
  const end = new Date(start.getTime() + (ev.meetingType?.durationMins ?? 30) * 60_000);
  await prisma.calendarEvent.update({ where: { id: ev.id }, data: { startAt: start, endAt: end } });
  return NextResponse.json({ ok: true });
}
