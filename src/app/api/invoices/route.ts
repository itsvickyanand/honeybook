import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { computeInvoiceTotals, InvoiceLineItem } from '@/lib/invoice';
import { currentFinancialYear } from '@/lib/financial-year';

const lineItem = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  hsn: z.string().optional(),
  quantity: z.number().nonnegative(),
  unit: z.string().min(1),
  unitPrice: z.number().nonnegative(),
});

const createSchema = z.object({
  proposalId: z.string().optional(),
  projectId: z.string().optional(),
  contactId: z.string().optional(),
  type: z.enum(['TAX', 'PROFORMA', 'RECEIPT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'DELIVERY_CHALLAN']).optional(),
  series: z.string().optional(),
  placeOfSupply: z.string().optional(),
  billToPlaceOfSupply: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  discount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  lineItems: z.array(lineItem).min(1),
});

export async function GET() {
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return NextResponse.json({ invoices });
}

export async function POST(req: Request) {
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const tenant = auth.tenant;

  // If tied to a project, validate ownership and inherit its contact when none given.
  let projectId = parsed.data.projectId;
  let contactId = parsed.data.contactId;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, tenantId: tenant.id },
      select: { id: true, contactId: true },
    });
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    contactId = contactId ?? project.contactId ?? undefined;
  }

  const lineItems: InvoiceLineItem[] = parsed.data.lineItems.map((li) => ({
    ...li,
    amount: li.quantity * li.unitPrice,
  }));
  const placeOfSupply = parsed.data.placeOfSupply ?? 'IN-MH';
  const billTo = parsed.data.billToPlaceOfSupply ?? placeOfSupply;
  const totals = computeInvoiceTotals({
    lineItems,
    taxRate: tenant.taxRate,
    discount: parsed.data.discount,
    tenantPlaceOfSupply: placeOfSupply,
    billToPlaceOfSupply: billTo,
  });

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      proposalId: parsed.data.proposalId,
      projectId,
      contactId,
      type: parsed.data.type ?? 'TAX',
      series: parsed.data.series ?? 'INV',
      financialYear: currentFinancialYear(),
      placeOfSupply,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      contentJson: {
        lineItems,
        notes: parsed.data.notes ?? '',
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
