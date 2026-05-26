import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';

/**
 * Apply a payment to its invoice + update invoice status. Idempotent by paymentId.
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
  const paid = sumAgg._sum.amount ?? 0;
  const status =
    paid >= invoice.total ? 'PAID' :
    paid > 0 ? 'PARTIALLY_PAID' :
    invoice.status;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { amountPaid: paid, status },
  });
  logger.info({ invoiceId: invoice.id, paid, status }, 'payment.reconciled');
  return { status, paid };
}
