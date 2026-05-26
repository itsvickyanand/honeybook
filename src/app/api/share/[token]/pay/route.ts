/**
 * Public endpoint — client clicks "Pay" on the portal.
 * If an invoice already exists for the proposal we use it; otherwise we
 * create a draft invoice on the fly, send it (allocating a number), then
 * create a Razorpay payment link.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createPaymentLink } from '@/lib/payments/razorpay';
import { computeInvoiceTotals, markInvoiceSent, InvoiceLineItem } from '@/lib/invoice';
import { currentFinancialYear } from '@/lib/financial-year';
import type { ProposalDoc } from '@/lib/proposal-schema';

export async function POST(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: true },
  });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 1. Find or create an invoice tied to this proposal.
  let invoice = await prisma.invoice.findFirst({
    where: { tenantId: p.tenantId, proposalId: p.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!invoice) {
    const doc = p.contentJson as unknown as ProposalDoc;
    const lineItems: InvoiceLineItem[] = [];
    for (const section of doc.sections) {
      for (const it of section.items) {
        if (it.quantity <= 0) continue;
        lineItems.push({
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          amount: it.quantity * it.unitPrice,
        });
      }
    }
    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Nothing to invoice' }, { status: 400 });
    }
    const totals = computeInvoiceTotals({
      lineItems,
      taxRate: p.tenant.taxRate,
      discount: doc.discount ?? 0,
      tenantPlaceOfSupply: 'IN-MH',
      billToPlaceOfSupply: 'IN-MH',
    });
    invoice = await prisma.invoice.create({
      data: {
        tenantId: p.tenantId,
        proposalId: p.id,
        contactId: p.contactId,
        type: 'TAX',
        series: 'INV',
        financialYear: currentFinancialYear(),
        placeOfSupply: 'IN-MH',
        contentJson: { lineItems, billToPlaceOfSupply: 'IN-MH' } as object,
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: totals.total,
        status: 'DRAFT',
      },
    });
  }

  // 2. Already fully paid? Short-circuit — no new Payment row, no new link.
  if (invoice.status === 'PAID' || invoice.amountPaid >= invoice.total) {
    return NextResponse.json({
      alreadyPaid: true,
      invoiceId: invoice.id,
      number: invoice.number,
    });
  }

  // 3. Ensure it's SENT (which allocates a number).
  if (invoice.status === 'DRAFT') {
    invoice = await markInvoiceSent(invoice.id);
  }

  // 4. Reuse an existing PENDING Payment for this invoice if one already exists
  //    (idempotency — guards against multi-click and tab refresh).
  const due = Math.max(0, invoice.total - invoice.amountPaid);
  let payment = await prisma.payment.findFirst({
    where: { tenantId: invoice.tenantId, invoiceId: invoice.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    payment = await prisma.payment.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        amount: due,
        currency: 'INR',
        method: 'UPI',
        status: 'PENDING',
        provider: 'razorpay',
      },
    });
  } else if (payment.amount !== due) {
    // Outstanding has changed since the row was created — refresh the amount.
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { amount: due },
    });
  }

  const link = await createPaymentLink({
    amountInRupees: payment.amount,
    description: `Payment for invoice ${invoice.number ?? invoice.id}`,
    reference: payment.id,
    customer: {
      name: p.clientName ?? 'Client',
      email: p.clientEmail ?? undefined,
    },
    callbackUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}?paid=1`,
    notes: { proposalId: p.id, invoiceId: invoice.id },
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: link.providerOrderId },
  });

  return NextResponse.json({ payUrl: link.shortUrl, paymentId: payment.id, invoiceId: invoice.id });
}
