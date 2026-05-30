/**
 * Public review endpoint (no auth — token-gated).
 * GET  returns minimal context for the submit page.
 * POST records the client's rating + text.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await prisma.review.findUnique({
    where: { token },
    include: { tenant: { select: { name: true, brandColor: true, logoUrl: true } } },
  });
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    vendorName: review.tenant.name,
    brandColor: review.tenant.brandColor,
    logoUrl: review.tenant.logoUrl,
    alreadySubmitted: review.status === 'SUBMITTED' || review.status === 'PUBLISHED',
    rating: review.rating,
    body: review.body,
  });
}

const schema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
  authorName: z.string().max(80).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const review = await prisma.review.findUnique({ where: { token } });
  if (!review) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (review.status === 'SUBMITTED' || review.status === 'PUBLISHED') {
    return NextResponse.json({ error: 'Already submitted' }, { status: 409 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  await prisma.review.update({
    where: { token },
    data: {
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      authorName: parsed.data.authorName,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    },
  });

  // Notify the vendor.
  await prisma.notification.create({
    data: {
      tenantId: review.tenantId,
      type: 'review.received',
      title: `New ${parsed.data.rating}★ review`,
      body: parsed.data.title ?? parsed.data.body?.slice(0, 80) ?? undefined,
      href: '/app/reviews',
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
