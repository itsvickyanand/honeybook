/**
 * Public portal status endpoint. Used by the client portal to refresh
 * after a pay/sign redirect — returns proposal status, signature state,
 * and the latest invoice (if any).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeInvoiceTotals, InvoiceLineItem } from '@/lib/invoice';
import { syncInvoiceFromGateway } from '@/lib/payments/sync';
import type { ProposalDoc } from '@/lib/proposal-schema';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await prisma.proposal.findUnique({
    where: { shareToken: token },
    select: { id: true, status: true, total: true, contentJson: true, tenant: { select: { taxRate: true } } },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Pull latest payment truth from Razorpay before reporting — makes the paid
  // state update on the post-payment redirect even if the webhook never arrived.
  const pendingInvoice = await prisma.invoice.findFirst({
    where: { proposalId: proposal.id, status: { notIn: ['PAID', 'VOID', 'DRAFT'] } },
    select: { id: true },
  });
  if (pendingInvoice) {
    await syncInvoiceFromGateway(pendingInvoice.id).catch(() => {});
  }

  const [signature, invoice] = await Promise.all([
    prisma.signatureRequest.findFirst({
      where: { proposalId: proposal.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, signedAt: true },
    }),
    prisma.invoice.findFirst({
      where: { proposalId: proposal.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, number: true, total: true, amountPaid: true },
    }),
  ]);

  // Single source-of-truth rule:
  //   • UNPAID  → the live total computed from the proposal's current content
  //              (line items + tax). The invoice is just a cache that re-syncs
  //              to this on the next pay click — including down to ₹0.
  //   • PAID/partial → the locked invoice figures win (it's a legal document).
  function liveTotalFromContent(): number {
    try {
      const doc = proposal!.contentJson as unknown as ProposalDoc;
      const lineItems: InvoiceLineItem[] = [];
      for (const s of doc.sections ?? []) {
        for (const it of s.items ?? []) {
          if (!it || it.quantity <= 0) continue;
          lineItems.push({ name: it.name, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, amount: it.quantity * it.unitPrice });
        }
      }
      if (lineItems.length === 0) return 0;
      const t = computeInvoiceTotals({
        lineItems, taxRate: doc.taxRate ?? proposal!.tenant.taxRate, discount: doc.discount ?? 0,
        tenantPlaceOfSupply: 'IN-MH', billToPlaceOfSupply: 'IN-MH',
      });
      return t.total;
    } catch {
      return 0;
    }
  }

  const hasPayment = !!invoice && (invoice.amountPaid > 0 || invoice.status === 'PAID');
  const displayTotal = hasPayment ? invoice!.total : liveTotalFromContent();

  // When unpaid, report the invoice with the live total so the Pay button and
  // the proposal body always agree.
  const effectiveInvoice = invoice
    ? hasPayment
      ? invoice
      : { ...invoice, total: displayTotal }
    : null;

  return NextResponse.json({
    proposal: { status: proposal.status, total: displayTotal },
    signature: signature ?? null,
    invoice: effectiveInvoice,
  });
}
