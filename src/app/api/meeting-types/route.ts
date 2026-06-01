/**
 * MeetingType — bookable session profiles. Each one gets a public /book/[slug] URL.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meeting';
}

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const items = await prisma.meetingType.findMany({
    where: { tenantId: auth.tenant.id, archived: false },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ items });
}

const schema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().optional(),
  durationMins: z.number().int().min(5).max(480).default(30),
  bufferMins: z.number().int().min(0).max(240).default(0),
  locationType: z.enum(['IN_PERSON', 'GOOGLE_MEET', 'ZOOM', 'PHONE', 'CUSTOM']).default('GOOGLE_MEET'),
  locationDetail: z.string().optional(),
  color: z.string().optional(),
  advanceNoticeHours: z.number().int().min(0).max(168).default(2),
  maxBookingDays: z.number().int().min(1).max(180).default(30),
  hostUserId: z.string().optional(),
  active: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });
  let slug = parsed.data.slug ?? slugify(parsed.data.name);
  // Ensure unique per tenant
  const taken = await prisma.meetingType.findFirst({ where: { tenantId: auth.tenant.id, slug } });
  if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const item = await prisma.meetingType.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      durationMins: parsed.data.durationMins,
      bufferMins: parsed.data.bufferMins,
      locationType: parsed.data.locationType,
      locationDetail: parsed.data.locationDetail,
      color: parsed.data.color ?? '#8b5cf6',
      advanceNoticeHours: parsed.data.advanceNoticeHours,
      maxBookingDays: parsed.data.maxBookingDays,
      hostUserId: parsed.data.hostUserId ?? auth.user.id,
      active: parsed.data.active ?? true,
    },
  });
  return NextResponse.json({ item }, { status: 201 });
}
