/**
 * Refund a payment.
 * - For Razorpay payments: calls the refunds API
 * - For manual/mock payments: creates a refund record locally
 * Either way, decrements the invoice's amountPaid via reconcile.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';

const schema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const payment = await prisma.payment.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (payment.status !== 'SUCCESS') return NextResponse.json({ error: 'Only successful payments can be refunded' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const refundAmount = parsed.data.amount ?? payment.amount;
  if (refundAmount > payment.amount) return NextResponse.json({ error: 'Refund exceeds payment amount' }, { status: 400 });

  // Razorpay refund call
  if (payment.provider === 'razorpay' && payment.providerRef && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    const res = await fetch(`https://api.razorpay.com/v1/payments/${payment.providerRef}/refund`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(refundAmount * 100), notes: { reason: parsed.data.reason ?? '' } }),
    });
    if (!res.ok) return NextResponse.json({ error: `Razorpay refund: ${res.status}` }, { status: 502 });
  }

  // Local refund record: a negative-amount Payment
  const refund = await prisma.payment.create({
    data: {
      tenantId: auth.tenant.id,
      invoiceId: payment.invoiceId,
      amount: -refundAmount,
      currency: payment.currency,
      method: payment.method,
      provider: payment.provider,
      providerRef: payment.providerRef ? `refund-${payment.providerRef}` : null,
      status: 'REFUNDED',
      note: parsed.data.reason ?? null,
      paidAt: new Date(),
    },
  });
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: refundAmount === payment.amount ? 'REFUNDED' : 'SUCCESS' },
  });
  await enqueue(JOB_NAMES.PAYMENT_RECONCILE, { paymentId: refund.id });

  return NextResponse.json({ refund });
}
