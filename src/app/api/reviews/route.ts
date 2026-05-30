/**
 * Reviews — request + list.
 * POST creates a Review (status REQUESTED) with a public token and emails the
 * client a link to /r/[token]. GET lists the tenant's reviews.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const reviews = await prisma.review.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { requestedAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ reviews });
}

const schema = z.object({
  projectId: z.string().optional(),
  contactId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const review = await prisma.review.create({
    data: {
      tenantId: auth.tenant.id,
      projectId: parsed.data.projectId,
      contactId: parsed.data.contactId,
      status: 'REQUESTED',
    },
  });

  // Email the client the review link if we can resolve an email.
  let clientEmail: string | null = null;
  if (parsed.data.contactId) {
    const c = await prisma.contact.findFirst({
      where: { id: parsed.data.contactId, tenantId: auth.tenant.id },
      select: { email: true },
    });
    clientEmail = c?.email ?? null;
  }
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const link = `${appUrl}/r/${review.token}`;
  if (clientEmail) {
    await enqueue(JOB_NAMES.EMAIL_SEND, {
      to: clientEmail,
      subject: `How did we do? — ${auth.tenant.name}`,
      html: `<p>Thanks for working with ${auth.tenant.name}!</p><p>We'd love a quick review: <a href="${link}">${link}</a></p>`,
      text: `Leave a review for ${auth.tenant.name}: ${link}`,
    }).catch(() => {});
  }

  return NextResponse.json({ review, link }, { status: 201 });
}
