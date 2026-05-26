/**
 * Public: list vendor's free / blocked slots for the next N days
 * so the client can pick a booking time.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const days = Math.min(60, Number(url.searchParams.get('days') ?? 30));
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const from = new Date();
  const to = new Date(Date.now() + days * 86400_000);
  const events = await prisma.calendarEvent.findMany({
    where: {
      tenantId: p.tenantId,
      startAt: { gte: from, lte: to },
      type: { in: ['BLOCKED', 'BOOKING'] },
    },
    select: { startAt: true, endAt: true, type: true, title: true },
  });
  return NextResponse.json({ events });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { startAt: string; endAt: string; title?: string } | null;
  if (!body) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // Conflict check
  const conflict = await prisma.calendarEvent.findFirst({
    where: {
      tenantId: p.tenantId,
      startAt: { lt: new Date(body.endAt) },
      endAt: { gt: new Date(body.startAt) },
      type: { in: ['BLOCKED', 'BOOKING'] },
    },
  });
  if (conflict) return NextResponse.json({ error: 'Slot is no longer available' }, { status: 409 });

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: p.tenantId,
      title: body.title ?? `Booking: ${p.clientName ?? 'client'}`,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      type: 'BOOKING',
      meta: { proposalId: p.id, source: 'portal' } as object,
    },
  });
  await prisma.proposalEvent.create({
    data: { proposalId: p.id, type: 'BOOKED', actor: 'client', payload: { eventId: event.id } as object },
  });
  return NextResponse.json({ event });
}
