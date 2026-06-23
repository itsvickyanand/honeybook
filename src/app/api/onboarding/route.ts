/**
 * Onboarding session — load (GET) / save answers (PATCH).
 * One DRAFT session per tenant; reused across visits.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { loadBusinessContext } from '@/lib/ai/onboarding';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const [session, ctx] = await Promise.all([
    prisma.onboardingSession.findFirst({
      where: { tenantId: auth.tenant.id, status: 'DRAFT' },
      orderBy: { updatedAt: 'desc' },
    }),
    loadBusinessContext(auth.tenant.id),
  ]);
  return NextResponse.json({
    session,
    tenant: {
      id: auth.tenant.id,
      name: ctx.businessName,
      businessTypeName: ctx.businessTypeName,
      businessTypeSlug: ctx.businessTypeSlug,
      currency: ctx.currency,
      locale: ctx.locale,
      onboardingCompletedAt: auth.tenant.onboardingCompletedAt,
    },
  });
}

const schema = z.object({ answers: z.record(z.unknown()) });

export async function PATCH(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const existing = await prisma.onboardingSession.findFirst({
    where: { tenantId: auth.tenant.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) {
    const session = await prisma.onboardingSession.update({
      where: { id: existing.id },
      data: { answers: parsed.data.answers as object },
    });
    return NextResponse.json({ session });
  }
  const session = await prisma.onboardingSession.create({
    data: { tenantId: auth.tenant.id, answers: parsed.data.answers as object },
  });
  return NextResponse.json({ session });
}
