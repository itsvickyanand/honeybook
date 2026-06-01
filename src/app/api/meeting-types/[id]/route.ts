import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().nullable().optional(),
  durationMins: z.number().int().min(5).max(480).optional(),
  bufferMins: z.number().int().min(0).max(240).optional(),
  locationType: z.enum(['IN_PERSON', 'GOOGLE_MEET', 'ZOOM', 'PHONE', 'CUSTOM']).optional(),
  locationDetail: z.string().nullable().optional(),
  color: z.string().optional(),
  advanceNoticeHours: z.number().int().min(0).max(168).optional(),
  maxBookingDays: z.number().int().min(1).max(180).optional(),
  hostUserId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const existing = await prisma.meetingType.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const item = await prisma.meetingType.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ item });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  await prisma.meetingType.updateMany({ where: { id, tenantId: auth.tenant.id }, data: { archived: true, active: false } });
  return NextResponse.json({ ok: true });
}
