/**
 * Vendor-side: record a manual (cash/cheque/bank transfer) payment against an invoice.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';

const schema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CHEQUE', 'BANK_TRANSFER', 'UPI', 'CARD']),
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
  await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: payment.id });
  return NextResponse.json({ payment });
}
