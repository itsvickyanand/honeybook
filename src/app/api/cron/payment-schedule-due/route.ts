/**
 * Daily cron — generate invoices for PaymentScheduleItems that came due.
 *
 * Triggered by vercel.json `crons` entry. Vercel sends a header
 * `x-vercel-cron: 1` we can use as a lightweight authenticator, plus we check
 * the optional CRON_SECRET if set.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { computeInvoiceTotals } from '@/lib/invoice';
import { currentFinancialYear } from '@/lib/financial-year';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { isAuthedCron } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthedCron(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const now = new Date();

  const due = await prisma.paymentScheduleItem.findMany({
    where: {
      status: 'SCHEDULED',
      dueDate: { lte: now },
    },
    include: { schedule: { include: { tenant: true, project: true } } },
    take: 200,
  });

  let invoiced = 0;
  for (const item of due) {
    try {
      const totals = computeInvoiceTotals({
        lineItems: [
          { name: item.label, quantity: 1, unit: 'item', unitPrice: item.amount, amount: item.amount },
        ],
        taxRate: item.schedule.tenant.taxRate,
        discount: 0,
        tenantPlaceOfSupply: 'IN-MH',
        billToPlaceOfSupply: 'IN-MH',
      });

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: item.schedule.tenantId,
          projectId: item.schedule.projectId,
          scheduleItemId: item.id,
          type: 'TAX',
          series: 'INV',
          financialYear: currentFinancialYear(),
          placeOfSupply: 'IN-MH',
          dueDate: new Date(item.dueDate.getTime() + 14 * 86400_000),
          contentJson: {
            lineItems: [
              { name: item.label, quantity: 1, unit: 'item', unitPrice: item.amount, amount: item.amount },
            ],
            billToPlaceOfSupply: 'IN-MH',
          } as object,
          subtotal: totals.subtotal,
          cgst: totals.cgst,
          sgst: totals.sgst,
          igst: totals.igst,
          total: totals.total,
          status: 'DRAFT',
        },
      });
      await prisma.paymentScheduleItem.update({
        where: { id: item.id },
        data: { status: 'INVOICED', invoicedAt: new Date() },
      });
      // Fire-and-forget reminder email to the vendor so they can review + send
      await enqueue(JOB_NAMES.NOTIFICATION_DISPATCH, {
        tenantId: item.schedule.tenantId,
        type: 'invoice.draft.created',
        title: `Invoice draft ready: ${item.label}`,
        body: `Schedule fired for ${item.schedule.project?.name ?? 'project'}`,
        href: `/app/invoices/${invoice.id}`,
      });
      invoiced++;
    } catch (e) {
      logger.error({ itemId: item.id, err: (e as Error).message }, 'cron.payment-schedule.failed');
    }
  }

  // Mark items overdue if their dueDate was >7 days ago and still SCHEDULED (failed)
  await prisma.paymentScheduleItem.updateMany({
    where: {
      status: 'SCHEDULED',
      dueDate: { lt: new Date(now.getTime() - 7 * 86400_000) },
    },
    data: { status: 'OVERDUE' },
  });

  return NextResponse.json({ ok: true, invoiced });
}
