/**
 * Razorpay webhook receiver.
 *
 * Handles BOTH event families Razorpay can send for a payment-link flow:
 *   - payment_link.paid / payment_link.partially_paid
 *       → reference is on payload.payment_link.entity.reference_id (= our Payment.id)
 *       → link id on payload.payment_link.entity.id (= our Payment.providerOrderId)
 *   - payment.captured / payment.failed
 *       → payload.payment.entity (notes may or may not carry our ids)
 *
 * Matching strategy (most→least specific):
 *   1. payment_link.entity.reference_id  → Payment.id
 *   2. payment.entity.notes.reference_id → Payment.id   (legacy)
 *   3. payment_link.entity.id            → Payment.providerOrderId
 *
 * After marking the Payment SUCCESS we reconcile INLINE (synchronous) so the
 * invoice→PAID transition + Project/Task auto-create happen even with no
 * worker running. We also enqueue the job as a belt-and-suspenders for the
 * worker; reconcile is idempotent so double-execution is safe.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/payments/razorpay';
import { reconcilePayment } from '@/lib/payments/reconcile';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { logger } from '@/lib/logger';

interface RzpEntity {
  id?: string;
  status?: string;
  amount?: number;
  amount_paid?: number;
  reference_id?: string;
  notes?: Record<string, string>;
}
interface RzpBody {
  event: string;
  payload?: {
    payment?: { entity?: RzpEntity };
    payment_link?: { entity?: RzpEntity };
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  if (!verifyWebhookSignature(raw, sig)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let body: RzpBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const paymentEnt = body.payload?.payment?.entity;
  const linkEnt = body.payload?.payment_link?.entity;

  // Dedupe key: prefer the payment id, fall back to link id + event.
  const dedupeId =
    paymentEnt?.id ?? `${linkEnt?.id ?? 'unknown'}-${body.event}-${Date.now()}`;
  try {
    await prisma.paymentWebhook.create({
      data: {
        provider: 'razorpay',
        eventType: body.event,
        externalId: dedupeId,
        payload: body as unknown as object,
      },
    });
  } catch {
    logger.info({ dedupeId, event: body.event }, 'razorpay.webhook.dedup');
    return NextResponse.json({ ok: true, dedup: true });
  }

  // Resolve our internal Payment.
  const reference =
    linkEnt?.reference_id ??
    paymentEnt?.notes?.reference_id ??
    null;
  const linkId = linkEnt?.id ?? null;

  let payment = reference
    ? await prisma.payment.findUnique({ where: { id: reference } })
    : null;
  if (!payment && linkId) {
    payment = await prisma.payment.findFirst({ where: { providerOrderId: linkId } });
  }
  if (!payment) {
    logger.warn({ event: body.event, reference, linkId }, 'razorpay.webhook.no-payment-match');
    return NextResponse.json({ ok: true, skipped: 'no-payment-match' });
  }

  // Decide outcome from event + entity status.
  const isPaid =
    body.event === 'payment_link.paid' ||
    body.event === 'payment.captured' ||
    paymentEnt?.status === 'captured' ||
    linkEnt?.status === 'paid';
  const isPartial =
    body.event === 'payment_link.partially_paid' ||
    linkEnt?.status === 'partially_paid';
  const isFailed =
    body.event === 'payment.failed' || paymentEnt?.status === 'failed';

  if (isPaid || isPartial) {
    // Amount actually paid: prefer the payment entity, else link's amount_paid.
    const paidPaise = paymentEnt?.amount ?? linkEnt?.amount_paid;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        providerRef: paymentEnt?.id ?? payment.providerRef,
        paidAt: new Date(),
        amount: paidPaise ? paidPaise / 100 : payment.amount,
      },
    });

    // Reconcile inline (source of truth) + enqueue for the worker (idempotent).
    try {
      const result = await reconcilePayment(payment.id);
      logger.info({ paymentId: payment.id, ...result }, 'razorpay.webhook.reconciled-inline');
    } catch (e) {
      logger.error({ paymentId: payment.id, err: (e as Error).message }, 'razorpay.webhook.reconcile-failed');
    }
    await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: payment.id }).catch(() => {});
  } else if (isFailed) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
  }

  return NextResponse.json({ ok: true });
}
