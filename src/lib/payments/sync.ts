/**
 * Gateway-driven reconciliation — pulls the truth FROM Razorpay rather than
 * waiting for a webhook to push it.
 *
 * Why this exists: a real payment only updates `amountPaid` when
 * `reconcilePayment()` runs, and in real-Razorpay mode that normally fires from
 * the webhook. If the webhook is misconfigured, delayed, or its signature fails,
 * the Payment row sits PENDING forever and the invoice never shows as paid even
 * though the client paid. This helper closes that gap: it asks Razorpay for the
 * payment-link status and, if paid/partially paid, flips our Payment to SUCCESS
 * and reconciles inline. Safe to call repeatedly (idempotent).
 */
import { prisma } from '../db';
import { logger } from '../logger';
import { fetchPaymentLinkStatus } from './razorpay';
import { reconcilePayment } from './reconcile';

export async function syncInvoiceFromGateway(invoiceId: string): Promise<{ updated: boolean }> {
  const pendings = await prisma.payment.findMany({
    where: {
      invoiceId,
      status: 'PENDING',
      provider: 'razorpay',
      providerOrderId: { not: null },
    },
  });
  if (pendings.length === 0) return { updated: false };

  let updated = false;
  for (const p of pendings) {
    const st = await fetchPaymentLinkStatus(p.providerOrderId!);
    if (!st) continue; // mock id / API error — skip gracefully
    if (st.status === 'paid' || (st.status === 'partially_paid' && st.amountPaid > 0)) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          status: 'SUCCESS',
          amount: st.amountPaid > 0 ? st.amountPaid : p.amount,
          paidAt: new Date(),
        },
      });
      await reconcilePayment(p.id).catch((e) =>
        logger.error({ paymentId: p.id, err: (e as Error).message }, 'sync.reconcile.failed')
      );
      updated = true;
      logger.info({ paymentId: p.id, invoiceId, status: st.status }, 'payment.synced-from-gateway');
    } else if (st.status === 'cancelled' || st.status === 'expired') {
      await prisma.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } });
    }
  }
  return { updated };
}
