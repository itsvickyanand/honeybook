import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { sendEmail } from '../../lib/comms';
import { emailInvoiceOverdue } from '../../lib/comms/templates';

/**
 * Daily sweep:
 *  - Transition SENT/VIEWED invoices past their dueDate into OVERDUE
 *  - For each OVERDUE invoice with an unpaid balance, fire a reminder email
 *    (rate-limited via Invoice.remindersSent — 3 max, weekly cadence)
 */
export async function handleOverdueSweep(_: Job): Promise<unknown> {
  const now = new Date();

  // Transition
  const transitioned = await prisma.invoice.updateMany({
    where: {
      status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      dueDate: { lt: now },
    },
    data: { status: 'OVERDUE' },
  });

  // Send reminders
  const candidates = await prisma.invoice.findMany({
    where: {
      status: 'OVERDUE',
      remindersSent: { lt: 3 },
    },
    include: { tenant: true, proposal: { include: { contact: true } } },
    take: 200,
  });

  let sent = 0;
  for (const inv of candidates) {
    const email = inv.proposal?.contact?.email ?? inv.proposal?.clientEmail;
    if (!email || !inv.number) continue;
    const remaining = inv.total - inv.amountPaid;
    if (remaining <= 0) continue;
    const tmpl = emailInvoiceOverdue({
      clientName: inv.proposal?.contact?.fullName ?? inv.proposal?.clientName ?? 'there',
      amountDue: remaining,
      currency: inv.tenant.currency,
      locale: inv.tenant.locale,
      invoiceNumber: inv.number,
      payUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${inv.proposal?.shareToken ?? ''}`,
    });
    await sendEmail({ to: email, ...tmpl });
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { remindersSent: { increment: 1 } },
    });
    sent++;
  }

  logger.info({ transitioned: transitioned.count, reminded: sent }, 'overdue.sweep.done');
  return { transitioned: transitioned.count, reminded: sent };
}
