/**
 * Mock gateway confirm endpoint — flips a Payment to SUCCESS and runs the
 * same reconcile job that a real Razorpay webhook would trigger.
 * Only active when RAZORPAY_KEY_ID is not set (otherwise force real flow).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { reconcilePayment } from '@/lib/payments/reconcile';
import { logger } from '@/lib/logger';

const schema = z.object({ paymentId: z.string() });

export async function POST(req: Request) {
  if (process.env.RAZORPAY_KEY_ID) {
    return NextResponse.json({ error: 'Mock pay disabled — Razorpay is configured' }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const payment = await prisma.payment.findUnique({ where: { id: parsed.data.paymentId } });
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  if (payment.status === 'SUCCESS') return NextResponse.json({ ok: true, already: true });

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'SUCCESS',
      providerRef: `mock-${payment.id.slice(-8)}`,
      paidAt: new Date(),
    },
  });
  // Reconcile inline (source of truth) + enqueue for the worker (idempotent).
  try {
    const result = await reconcilePayment(payment.id);
    logger.info({ paymentId: payment.id, ...result }, 'mock-pay.reconciled-inline');
  } catch (e) {
    logger.error({ paymentId: payment.id, err: (e as Error).message }, 'mock-pay.reconcile-failed');
  }
  await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: payment.id }).catch(() => {});
  logger.info({ paymentId: payment.id }, 'mock-pay.confirmed');
  return NextResponse.json({ ok: true });
}
