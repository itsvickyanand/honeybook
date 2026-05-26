/**
 * Razorpay webhook receiver.
 * - Verifies signature with timing-safe compare
 * - Dedupes by event id via PaymentWebhook.externalId (unique)
 * - Marks Payment SUCCESS/FAILED and enqueues reconciliation
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: { event: string; payload: { payment?: { entity: { id: string; status: string; notes?: Record<string, string>; amount?: number } } } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const eventId = (body.payload?.payment?.entity?.id ?? `evt-${Date.now()}`);
  // Dedupe
  try {
    await prisma.paymentWebhook.create({
      data: {
        provider: 'razorpay',
        eventType: body.event,
        externalId: eventId,
        payload: body as unknown as object,
      },
    });
  } catch {
    logger.info({ eventId }, 'razorpay.webhook.dedup');
    return NextResponse.json({ ok: true, dedup: true });
  }

  // Map outcome
  const ent = body.payload.payment?.entity;
  if (!ent) return NextResponse.json({ ok: true });

  // We stored our internal payment id as `reference_id` on the payment link;
  // Razorpay echoes it back via notes.
  const internalPaymentId = ent.notes?.reference_id;
  if (!internalPaymentId) {
    // Fall back to looking up by providerOrderId (the payment link id).
    return NextResponse.json({ ok: true, skipped: 'no-ref' });
  }
  const payment = await prisma.payment.findUnique({ where: { id: internalPaymentId } });
  if (!payment) return NextResponse.json({ ok: true });

  if (ent.status === 'captured' || body.event === 'payment.captured') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        providerRef: ent.id,
        paidAt: new Date(),
        amount: ent.amount ? ent.amount / 100 : payment.amount,
      },
    });
    await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: payment.id });
  } else if (ent.status === 'failed' || body.event === 'payment.failed') {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
  }
  return NextResponse.json({ ok: true });
}
