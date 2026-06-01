/**
 * Per-user weekly availability. GET returns current user's rules.
 * POST replaces them in bulk (the editor sends the full set).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { tenantId: auth.tenant.id, userId: auth.user.id }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.availabilityException.findMany({ where: { tenantId: auth.tenant.id, userId: auth.user.id, date: { gte: new Date() } }, orderBy: { date: 'asc' } }),
  ]);
  return NextResponse.json({ rules, exceptions });
}

const timeRe = /^\d{2}:\d{2}$/;
const schema = z.object({
  rules: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(timeRe),
    endTime: z.string().regex(timeRe),
  })),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  // Wholesale replace this user's rules.
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({ where: { tenantId: auth.tenant.id, userId: auth.user.id } }),
    prisma.availabilityRule.createMany({
      data: parsed.data.rules.map((r) => ({
        tenantId: auth.tenant.id, userId: auth.user.id,
        dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime,
      })),
    }),
  ]);
  return NextResponse.json({ ok: true });
}
