/**
 * Single calendar event: PATCH (move/edit), DELETE (cancel). Only owns
 * CalendarEvent rows (not tasks/projects — those have their own APIs).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  location: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  status: z.enum(['PROPOSED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED']).optional(),
  projectId: z.string().nullable().optional(),
  contactId: z.string().nullable().optional(),
  hostUserId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const existing = await prisma.calendarEvent.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.startAt) data.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt) data.endAt = new Date(parsed.data.endAt);
  const event = await prisma.calendarEvent.update({ where: { id }, data });
  return NextResponse.json({ event });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const existing = await prisma.calendarEvent.findFirst({ where: { id, tenantId: auth.tenant.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.calendarEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
