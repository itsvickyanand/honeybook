import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { onInvoicePaid, onProposalStatusChanged } from '../../lib/lifecycle';

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

  // Deposit-paid auto-accept: any successful payment against a proposal
  // that hasn't been formally accepted should flip it to ACCEPTED.
  if (paid > 0 && invoice.proposalId) {
    const proposal = await prisma.proposal.findUnique({ where: { id: invoice.proposalId } });
    if (proposal && ['DRAFT', 'SENT', 'VIEWED', 'CHANGES_REQUESTED'].includes(proposal.status)) {
      const oldStatus = proposal.status;
      await prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await prisma.proposalEvent.create({
        data: { proposalId: proposal.id, type: 'ACCEPTED', actor: 'client', payload: { source: 'deposit-paid' } as object },
      });
      try { await onProposalStatusChanged(proposal.id, 'ACCEPTED', oldStatus); }
      catch (e) { logger.warn({ err: (e as Error).message }, 'auto-accept.fanout.failed'); }
      logger.info({ proposalId: proposal.id }, 'proposal.auto-accepted-on-deposit');
    }
  }

  return { status, paid };
}
