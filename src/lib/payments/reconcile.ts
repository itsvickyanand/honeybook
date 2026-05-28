/**
 * Core payment reconciliation — idempotent.
 *
 * Extracted from the BullMQ worker so it can ALSO run inline (synchronously)
 * inside the webhook + mock-pay request handlers. This guarantees the
 * invoice→PAID transition and the onInvoicePaid fan-out (Project + Tasks
 * auto-create) happen even when no separate worker process is running.
 *
 * Safe to call multiple times for the same paymentId — re-runs no-op once the
 * invoice is already PAID (the fan-out is gated on the PAID transition).
 */
import { prisma } from '../db';
import { logger } from '../logger';
import { onInvoicePaid, onProposalStatusChanged } from '../lifecycle';

export interface ReconcileResult {
  status: string;
  paid?: number;
  skipped?: string;
}

export async function reconcilePayment(paymentId: string): Promise<ReconcileResult> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { status: 'skipped', skipped: 'not-found' };
  if (payment.status !== 'SUCCESS') return { status: 'skipped', skipped: `status:${payment.status}` };
  if (!payment.invoiceId) return { status: 'skipped', skipped: 'no-invoice' };

  const invoice = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
  if (!invoice) return { status: 'skipped', skipped: 'invoice-missing' };

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

  // If this payment item came from a PaymentScheduleItem, mark it PAID.
  if (invoice.scheduleItemId && status === 'PAID') {
    await prisma.paymentScheduleItem.update({
      where: { id: invoice.scheduleItemId },
      data: { status: 'PAID', paidAt: new Date() },
    }).catch(() => { /* item may have been removed; ignore */ });
  }

  // Fan-out — only on transition into PAID, not on subsequent reruns.
  if (status === 'PAID' && wasNotPaid) {
    try {
      await onInvoicePaid(invoice.id);
    } catch (e) {
      logger.error({ invoiceId: invoice.id, err: (e as Error).message }, 'payment.fanout.failed');
    }
  }

  // Deposit-paid auto-accept: any successful payment against a proposal that
  // hasn't been formally accepted flips it to ACCEPTED (which itself triggers
  // the proposal fan-out, and onInvoicePaid handles project creation).
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
