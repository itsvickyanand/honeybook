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

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') === 'deposit' ? 'deposit' : 'full';
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: true },
  });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Compute line items + totals from the CURRENT proposal content.
  function computeFromProposal() {
    const doc = p!.contentJson as unknown as ProposalDoc;
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
    const totals = computeInvoiceTotals({
      lineItems,
      taxRate: doc.taxRate ?? p!.tenant.taxRate,
      discount: doc.discount ?? 0,
      tenantPlaceOfSupply: 'IN-MH',
      billToPlaceOfSupply: 'IN-MH',
    });
    return { lineItems, totals };
  }

  // 1. Find or create an invoice tied to this proposal.
  let invoice = await prisma.invoice.findFirst({
    where: { tenantId: p.tenantId, proposalId: p.id },
    orderBy: { createdAt: 'desc' },
  });

  if (!invoice) {
    const { lineItems, totals } = computeFromProposal();
    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Nothing to invoice' }, { status: 400 });
    }
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
  } else if (invoice.amountPaid === 0 && invoice.status !== 'PAID') {
    // Nothing paid yet → keep the invoice in sync with proposal edits,
    // INCLUDING down to ₹0 when the vendor removes all line items. (Once a
    // payment lands, the invoice locks as a legal document.)
    const { lineItems, totals } = computeFromProposal();
    if (Math.abs(totals.total - invoice.total) > 0.01) {
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
  }

  // 2a. Nothing to charge — proposal has no priced items. Don't issue a ₹0 link.
  if (invoice.amountPaid === 0 && invoice.total <= 0) {
    return NextResponse.json(
      { error: 'nothing_to_pay', message: 'This proposal has no priced items yet, so there is nothing to pay.' },
      { status: 400 }
    );
  }

  // 2b. Already fully paid? Short-circuit — no new Payment row, no new link.
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

  // 4. Compute "due" — full balance, or deposit slice if requested
  const fullDue = Math.max(0, invoice.total - invoice.amountPaid);
  const depositPct = p.depositPercent ?? 0;
  const isDeposit = mode === 'deposit' && depositPct > 0 && invoice.amountPaid === 0;
  const due = isDeposit
    ? Math.min(fullDue, Math.round((invoice.total * depositPct) / 100))
    : fullDue;

  // Per-transaction ceiling. NOTE on why amounts may look "capped":
  //   • In LIVE (activated/KYC-complete) Razorpay there is effectively no low
  //     cap — UPI allows ~₹1L–2L and cards/netbanking much higher. Set
  //     RAZORPAY_PAYMENT_LINK_MAX to a high value (or leave the high default).
  //   • In TEST mode / before account activation, Razorpay enforces its OWN low
  //     per-payment limit that we cannot raise from code — that is the usual
  //     cause of "the amount is very small". Activate the account to remove it.
  // Rather than erroring on large bookings we collect an ADVANCE up to the cap
  // as a partial payment: the invoice goes PARTIALLY_PAID, the booking is
  // confirmed, and the balance is collected later via the payment plan.
  const linkMaxRupees = Number(process.env.RAZORPAY_PAYMENT_LINK_MAX ?? 1000000);
  const usingRealRazorpay = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  let collecting = due;
  let cappedAdvance = false;
  if (usingRealRazorpay && due > linkMaxRupees && !isDeposit) {
    collecting = linkMaxRupees;
    cappedAdvance = true;
  }

  // Reuse an existing PENDING Payment for this invoice if one already exists
  // (idempotency — guards against multi-click and tab refresh).
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
    // Outstanding/advance has changed since the row was created — refresh.
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { amount: collecting },
    });
  }

  let link;
  try {
    link = await createPaymentLink({
      amountInRupees: payment.amount,
      description: `Payment for invoice ${invoice.number ?? invoice.id}`,
      // Razorpay requires reference_id to be globally unique per link. A retry
      // for the same Payment must use a fresh reference_id, so we suffix with a
      // timestamp. The webhook still resolves our Payment via notes.reference_id
      // (= payment.id) and providerOrderId, so matching is unaffected.
      reference: `${payment.id}-${Date.now()}`,
      customer: {
        name: p.clientName ?? 'Client',
        email: p.clientEmail ?? undefined,
      },
      callbackUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}?paid=1`,
      // notes.reference_id lets the `payment.captured` event path (which only
      // carries the payment entity) resolve our Payment row.
      notes: { reference_id: payment.id, proposalId: p.id, invoiceId: invoice.id, tenantId: p.tenantId },
    }, p.tenantId);
  } catch (e) {
    // Surface a clean message from the gateway rather than a 500.
    const raw = (e as Error).message || 'Payment gateway error';
    const m = /amount exceeds maximum/i.test(raw)
      ? `This amount (₹${due.toLocaleString('en-IN')}) exceeds the payment gateway's per-payment limit. Please pay a deposit or ask the vendor to split it into a payment plan.`
      : 'We could not start the payment right now. Please try again, or contact the vendor.';
    return NextResponse.json({ error: 'gateway_error', message: m, detail: raw.slice(0, 300) }, { status: 400 });
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: link.providerOrderId },
  });

  return NextResponse.json({
    payUrl: link.shortUrl,
    paymentId: payment.id,
    invoiceId: invoice.id,
    amount: collecting,
    cappedAdvance,
    balanceAfter: cappedAdvance ? Math.max(0, fullDue - collecting) : 0,
    note: cappedAdvance
      ? `Collecting an advance of ₹${collecting.toLocaleString('en-IN')} now (per-payment limit). Balance ₹${Math.max(0, fullDue - collecting).toLocaleString('en-IN')} can be collected via the payment plan.`
      : undefined,
  });
}
