/**
 * Daily — flip past-due invoices to OVERDUE and enqueue reminder emails.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAuthedCron } from '@/lib/cron-auth';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthedCron(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  const overdue = await prisma.invoice.findMany({
    where: {
      status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID'] },
      dueDate: { lt: now },
    },
    include: { tenant: { select: { name: true } }, proposal: { select: { clientEmail: true, clientName: true } } },
    take: 200,
  });

  let updated = 0;
  for (const inv of overdue) {
    try {
      await prisma.invoice.update({
        where: { id: inv.id },
        data: {
          status: 'OVERDUE',
          remindersSent: { increment: 1 },
        },
      });
      if (inv.proposal?.clientEmail) {
        await enqueue(JOB_NAMES.EMAIL_SEND, {
          to: inv.proposal.clientEmail,
          subject: `Payment reminder · Invoice ${inv.number ?? 'pending'}`,
          html: `<p>Hi ${inv.proposal.clientName ?? ''},</p><p>This is a friendly reminder that invoice <b>${inv.number ?? 'pending'}</b> from <b>${inv.tenant.name}</b> is now overdue.</p>`,
          text: `Reminder: invoice ${inv.number ?? 'pending'} from ${inv.tenant.name} is overdue.`,
        });
      }
      updated++;
    } catch (e) {
      logger.error({ invoiceId: inv.id, err: (e as Error).message }, 'cron.overdue.failed');
    }
  }

  return NextResponse.json({ ok: true, updated });
}
