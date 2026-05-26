import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { onInvoicePaid } from '../../lib/lifecycle';

/**
 * Apply a payment to its invoice + update invoice status. Idempotent by paymentId.
 * Fires the fan-out lifecycle when the invoice transitions to PAID.
 */
export async function handlePaymentReconcile(job: Job): Promise<unknown> {
  const { paymentId } = job.data as { paymentId: string };
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { skipped: 'not-found' };
  if (payment.status !== 'SUCCESS') return { skipped: `status:${payment.status}` };
  if (!payment.invoiceId) return { skipped: 'no-invoice' };

  const invoice = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
  if (!invoice) return { skipped: 'invoice-missing' };

  const sumAgg = await prisma.payment.aggregate({
    where: { invoiceId: invoice.id, status: 'SUCCESS' },
    _sum: { amount: true },
  });
  const rawSum = sumAgg._sum.amount ?? 0;
  // Cap at invoice.total so accidental multi-pay doesn't show >100% paid.
  // (Prevents the historical "₹78L paid vs ₹26L total" oddity.)
  const paid = Math.min(rawSum, invoice.total);
  const status =
    paid >= invoice.total ? 'PAID' :
    paid > 0 ? 'PARTIALLY_PAID' :
    invoice.status;

  const wasNotPaid = invoice.status !== 'PAID';

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid: paid, status },
  });
  logger.info({ invoiceId: invoice.id, paid, rawSum, status }, 'payment.reconciled');

  // Fan-out — only on transition into PAID, not on subsequent reruns
  if (status === 'PAID' && wasNotPaid) {
    try {
      await onInvoicePaid(invoice.id);
    } catch (e) {
      logger.error({ invoiceId: invoice.id, err: (e as Error).message }, 'payment.fanout.failed');
    }
  }

  return { status, paid };
}
