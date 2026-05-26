import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const where: { tenantId: string; startAt?: { gte?: Date; lte?: Date } } = { tenantId: auth.tenant.id };
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt.gte = new Date(from);
    if (to) where.startAt.lte = new Date(to);
  }
  const events = await prisma.calendarEvent.findMany({ where, orderBy: { startAt: 'asc' } });
  return NextResponse.json({ events });
}

const schema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  type: z.enum(['BLOCKED', 'BOOKING', 'INTERNAL']).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: auth.tenant.id,
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      allDay: parsed.data.allDay ?? false,
      location: parsed.data.location,
      type: parsed.data.type ?? 'BLOCKED',
    },
  });
  // TODO: enqueue Google Calendar push if connected
  return NextResponse.json({ event });
}
