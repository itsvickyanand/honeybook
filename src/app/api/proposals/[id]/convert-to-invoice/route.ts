/**
 * Convert an accepted/sent proposal into a DRAFT invoice.
 * Pulls line items from the proposal's current contentJson; vendor reviews + sends.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { computeInvoiceTotals, InvoiceLineItem } from '@/lib/invoice';
import { currentFinancialYear } from '@/lib/financial-year';
import type { ProposalDoc } from '@/lib/proposal-schema';

const schema = z.object({
  placeOfSupply: z.string().optional(),
  billToPlaceOfSupply: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  type: z.enum(['TAX', 'PROFORMA']).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const p = await prisma.proposal.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const doc = p.contentJson as unknown as ProposalDoc;
  const lineItems: InvoiceLineItem[] = [];
  for (const section of doc.sections) {
    for (const it of section.items) {
      if (it.quantity <= 0) continue;
      lineItems.push({
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        amount: it.quantity * it.unitPrice,
      });
    }
  }
  if (lineItems.length === 0) {
    return NextResponse.json({ error: 'Proposal has no priced line items' }, { status: 400 });
  }

  const placeOfSupply = parsed.data.placeOfSupply ?? 'IN-MH';
  const billTo = parsed.data.billToPlaceOfSupply ?? placeOfSupply;
  const totals = computeInvoiceTotals({
    lineItems,
    taxRate: auth.tenant.taxRate,
    discount: doc.discount ?? 0,
    tenantPlaceOfSupply: placeOfSupply,
    billToPlaceOfSupply: billTo,
  });

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: auth.tenant.id,
      proposalId: p.id,
      contactId: p.contactId,
      type: parsed.data.type ?? 'TAX',
      series: 'INV',
      financialYear: currentFinancialYear(),
      placeOfSupply,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      contentJson: {
        lineItems,
        notes: `Generated from proposal ${p.title}`,
        billToPlaceOfSupply: billTo,
      } as object,
      subtotal: totals.subtotal,
      cgst: totals.cgst,
      sgst: totals.sgst,
      igst: totals.igst,
      total: totals.total,
      status: 'DRAFT',
    },
  });
  return NextResponse.json({ invoice });
}
