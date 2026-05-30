/**
 * Public: client pays a shared invoice (by shareToken). Creates a Razorpay
 * payment link for the outstanding balance (advance-capped like the proposal
 * pay flow) and returns the pay URL.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createPaymentLink } from '@/lib/payments/razorpay';

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { shareToken: token },
    include: { tenant: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const contact = invoice.contactId
    ? await prisma.contact.findUnique({ where: { id: invoice.contactId }, select: { fullName: true, email: true } })
    : null;

  if (invoice.status === 'VOID') return NextResponse.json({ error: 'Invoice is void' }, { status: 400 });
  const fullDue = Math.max(0, invoice.total - invoice.amountPaid);
  if (invoice.status === 'PAID' || fullDue <= 0) {
    return NextResponse.json({ alreadyPaid: true, invoiceId: invoice.id });
  }

  // Advance-cap (see proposal pay route for rationale).
  const linkMaxRupees = Number(process.env.RAZORPAY_PAYMENT_LINK_MAX ?? 1000000);
  const usingRealRazorpay = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  let collecting = fullDue;
  let cappedAdvance = false;
  if (usingRealRazorpay && fullDue > linkMaxRupees) {
    collecting = linkMaxRupees;
    cappedAdvance = true;
  }

  // Reuse a PENDING payment if present (idempotency on refresh/multi-click).
  let payment = await prisma.payment.findFirst({
    where: { tenantId: invoice.tenantId, invoiceId: invoice.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        amount: collecting,
        currency: 'INR',
        method: 'UPI',
        status: 'PENDING',
        provider: 'razorpay',
      },
    });
  } else if (payment.amount !== collecting) {
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { amount: collecting } });
  }

  let link;
  try {
    link = await createPaymentLink({
      amountInRupees: payment.amount,
      description: `Payment for invoice ${invoice.number ?? invoice.id}`,
      reference: `${payment.id}-${Date.now()}`,
      customer: {
        name: contact?.fullName ?? 'Client',
        email: contact?.email ?? undefined,
      },
      callbackUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/i/${token}?paid=1`,
      notes: { reference_id: payment.id, invoiceId: invoice.id },
    });
  } catch (e) {
    const raw = (e as Error).message || 'Payment gateway error';
    return NextResponse.json({ error: 'gateway_error', detail: raw.slice(0, 300) }, { status: 400 });
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: link.providerOrderId } });

  return NextResponse.json({
    payUrl: link.shortUrl,
    amount: collecting,
    cappedAdvance,
    balanceAfter: cappedAdvance ? Math.max(0, fullDue - collecting) : 0,
  });
}
