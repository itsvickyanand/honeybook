/**
 * Vendor-side: record a manual (cash/cheque/bank transfer) payment against an invoice.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { reconcilePayment } from '@/lib/payments/reconcile';

const schema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'NETBANKING', 'UPI', 'CARD', 'RAZORPAY']),
  paidAt: z.string().datetime().optional(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const invoice = await prisma.invoice.findFirst({
    where: { id: parsed.data.invoiceId, tenantId: auth.tenant.id },
  });
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  // Block any new payment once the invoice is fully paid or void — keeps Mark
  // paid / Record payment / Sync flows from over-collecting on a closed invoice.
  if (invoice.status === 'PAID' || invoice.amountPaid >= invoice.total) {
    return NextResponse.json({ error: 'Invoice is already fully paid — payment options are closed.' }, { status: 400 });
  }
  if (invoice.status === 'VOID') {
    return NextResponse.json({ error: 'Invoice is void.' }, { status: 400 });
  }
  // Cap the new payment to the outstanding balance so we never accept an
  // over-payment, even if the UI miscalculates.
  const balance = Math.max(0, invoice.total - invoice.amountPaid);
  if (parsed.data.amount > balance + 0.01) {
    return NextResponse.json({ error: `Amount exceeds outstanding balance (${balance.toFixed(2)}).` }, { status: 400 });
  }

  const payment = await prisma.payment.create({
    data: {
      tenantId: auth.tenant.id,
      invoiceId: invoice.id,
      amount: parsed.data.amount,
      currency: 'INR',
      method: parsed.data.method,
      provider: 'manual',
      status: 'SUCCESS',
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
      note: parsed.data.note,
    },
  });
  // Reconcile inline so the invoice updates + project is created immediately,
  // even without a worker. Enqueue too (idempotent) for the worker path.
  await reconcilePayment(payment.id).catch(() => {});
  await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: payment.id }).catch(() => {});
  return NextResponse.json({ payment });
}
