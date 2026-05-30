/**
 * Vendor-side: generate (or reuse) a payment link for a proposal and email
 * it to the client. Reuses the same code path as the public /pay endpoint
 * (find-or-create invoice, find-or-create PENDING Payment, request link).
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { createPaymentLink } from '@/lib/payments/razorpay';
import { computeInvoiceTotals, markInvoiceSent, InvoiceLineItem } from '@/lib/invoice';
import { currentFinancialYear } from '@/lib/financial-year';
import { sendEmail } from '@/lib/comms';
import { audit } from '@/lib/audit';
import type { ProposalDoc } from '@/lib/proposal-schema';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;

  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { tenant: true },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 1. find/create invoice
  let invoice = await prisma.invoice.findFirst({
    where: { tenantId: proposal.tenantId, proposalId: proposal.id },
    orderBy: { createdAt: 'desc' },
  });
  // Compute the CURRENT totals from the proposal (single source of truth).
  const doc = proposal.contentJson as unknown as ProposalDoc;
  const lineItems: InvoiceLineItem[] = [];
  for (const s of doc.sections) for (const it of s.items) {
    if (it.quantity <= 0) continue;
    lineItems.push({ name: it.name, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, amount: it.quantity * it.unitPrice });
  }
  const totals = computeInvoiceTotals({
    lineItems,
    taxRate: doc.taxRate ?? proposal.tenant.taxRate,
    discount: doc.discount ?? 0,
    tenantPlaceOfSupply: 'IN-MH',
    billToPlaceOfSupply: 'IN-MH',
  });

  if (!invoice) {
    if (lineItems.length === 0) return NextResponse.json({ error: 'Nothing to invoice' }, { status: 400 });
    invoice = await prisma.invoice.create({
      data: {
        tenantId: proposal.tenantId,
        proposalId: proposal.id,
        contactId: proposal.contactId,
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
  } else if (invoice.amountPaid === 0 && invoice.status !== 'PAID' && Math.abs(totals.total - invoice.total) > 0.01) {
    // Keep the unpaid invoice in sync with proposal edits before sending a link.
    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        contentJson: { lineItems, billToPlaceOfSupply: 'IN-MH' } as object,
        subtotal: totals.subtotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        total: totals.total,
      },
    });
  }

  if (invoice.status === 'PAID' || invoice.amountPaid >= invoice.total) {
    return NextResponse.json({ alreadyPaid: true, invoiceId: invoice.id });
  }
  if (invoice.status === 'DRAFT') invoice = await markInvoiceSent(invoice.id);

  // 2. reuse-or-create PENDING payment (refresh amount if the balance changed)
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
    payment = await prisma.payment.update({ where: { id: payment.id }, data: { amount: due } });
  }

  const link = await createPaymentLink({
    amountInRupees: payment.amount,
    description: `Payment for invoice ${invoice.number ?? invoice.id}`,
    // reference_id must be globally unique per link; suffix with a timestamp so
    // retries don't collide. The webhook resolves our Payment via notes.reference_id.
    reference: `${payment.id}-${Date.now()}`,
    customer: { name: proposal.clientName ?? 'Client', email: proposal.clientEmail ?? undefined },
    callbackUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${proposal.shareToken}?paid=1`,
    notes: { reference_id: payment.id, proposalId: proposal.id, invoiceId: invoice.id },
  });

  await prisma.payment.update({ where: { id: payment.id }, data: { providerOrderId: link.providerOrderId } });

  // 3. email the client
  if (proposal.clientEmail) {
    await sendEmail({
      to: proposal.clientEmail,
      subject: `Payment link from ${proposal.tenant.name} · ${invoice.number}`,
      html: `<p>Hi ${proposal.clientName ?? 'there'},</p>
<p>Here is your secure payment link for invoice <strong>${invoice.number}</strong>:</p>
<p style="margin:24px 0">
  <a href="${link.shortUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Pay now</a>
</p>
<p style="color:#666;font-size:12px">Or paste this link in your browser:<br/>${link.shortUrl}</p>`,
    });
  }

  await audit({
    tenantId: proposal.tenantId,
    userId: auth.user.id,
    action: 'send',
    entity: 'PaymentLink',
    entityId: payment.id,
  });

  return NextResponse.json({ payUrl: link.shortUrl, paymentId: payment.id, invoiceId: invoice.id });
}
