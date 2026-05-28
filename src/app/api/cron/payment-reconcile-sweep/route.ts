/**
 * Safety-net cron — catches payments that a missed/lost webhook would otherwise
 * leave stuck in PENDING.
 *
 * For each Razorpay PENDING payment older than 3 minutes, ask Razorpay for the
 * payment-link status. If it's `paid`/`partially_paid`, mark the Payment
 * SUCCESS and reconcile (idempotent → safe even if the webhook later arrives).
 *
 * Runs every 15 minutes (see vercel.json).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAuthedCron } from '@/lib/cron-auth';
import { fetchPaymentLinkStatus } from '@/lib/payments/razorpay';
import { reconcilePayment } from '@/lib/payments/reconcile';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthedCron(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const cutoff = new Date(Date.now() - 3 * 60_000);
  const pending = await prisma.payment.findMany({
    where: {
      provider: 'razorpay',
      status: 'PENDING',
      createdAt: { lt: cutoff },
      providerOrderId: { not: null },
    },
    take: 100,
    orderBy: { createdAt: 'asc' },
  });

  let reconciled = 0;
  let stillPending = 0;
  for (const p of pending) {
    if (!p.providerOrderId) continue;
    const status = await fetchPaymentLinkStatus(p.providerOrderId);
    if (!status) { stillPending++; continue; }
    if (status.status === 'paid' || status.status === 'partially_paid') {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          status: 'SUCCESS',
          paidAt: new Date(),
          amount: status.amountPaid > 0 ? status.amountPaid : p.amount,
        },
      });
      try {
        await reconcilePayment(p.id);
        reconciled++;
      } catch (e) {
        logger.error({ paymentId: p.id, err: (e as Error).message }, 'cron.reconcile-sweep.failed');
      }
    } else if (status.status === 'cancelled' || status.status === 'expired') {
      await prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } });
    } else {
      stillPending++;
    }
  }

  return NextResponse.json({ ok: true, checked: pending.length, reconciled, stillPending });
}
