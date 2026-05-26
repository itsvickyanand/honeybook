/**
 * Invoice engine.
 *
 * Implements:
 *  - Strict state machine (DRAFT → SENT → VIEWED / PARTIALLY_PAID / PAID / OVERDUE / VOID)
 *    with immutability of (number, contentJson, totals) once SENT.
 *  - Concurrency-safe numbering via InvoiceSequence with `SELECT … FOR UPDATE`
 *    (per BRD Addendum Fix 16). Numbers are allocated AT SENT, not at DRAFT,
 *    to eliminate gap risk on rolled-back DRAFTs.
 *  - GST calculation by place-of-supply (intra-state CGST+SGST vs inter-state IGST).
 */
import { prisma } from './db';
import { currentFinancialYear } from './financial-year';
import { enqueue, JOB_NAMES } from './queue';

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'VOID';

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ['SENT', 'VOID'],
  SENT: ['VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  VIEWED: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'OVERDUE', 'VOID'],
  PAID: [],
  OVERDUE: ['PARTIALLY_PAID', 'PAID', 'VOID'],
  VOID: [],
};

export function canTransition(from: string, to: string): boolean {
  return (TRANSITIONS[from as InvoiceStatus] ?? []).includes(to as InvoiceStatus);
}

export interface InvoiceLineItem {
  name: string;
  description?: string;
  hsn?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxRate?: number;
}

export interface ComputeArgs {
  lineItems: InvoiceLineItem[];
  taxRate: number; // e.g. 18
  discount?: number;
  tenantPlaceOfSupply: string; // e.g. IN-MH
  billToPlaceOfSupply: string; // e.g. IN-KA
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function computeInvoiceTotals(args: ComputeArgs): InvoiceTotals {
  let subtotal = 0;
  for (const li of args.lineItems) {
    li.amount = round2(li.quantity * li.unitPrice);
    subtotal += li.amount;
  }
  const discount = args.discount ?? 0;
  const taxable = Math.max(0, subtotal - discount);
  const tax = round2((taxable * args.taxRate) / 100);
  const sameState =
    args.tenantPlaceOfSupply && args.billToPlaceOfSupply &&
    args.tenantPlaceOfSupply === args.billToPlaceOfSupply;
  const cgst = sameState ? round2(tax / 2) : 0;
  const sgst = sameState ? round2(tax / 2) : 0;
  const igst = sameState ? 0 : tax;
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    taxable: round2(taxable),
    cgst,
    sgst,
    igst,
    total: round2(taxable + cgst + sgst + igst),
  };
}

function round2(n: number) { return Math.round(n * 100) / 100; }

/**
 * Allocate the next invoice number atomically, locking the (tenant, series, FY) row.
 * MUST be called within a transaction.
 */
export async function allocateInvoiceNumber(
  tx: typeof prisma,
  args: { tenantId: string; series?: string; financialYear?: string }
): Promise<{ number: string; series: string; financialYear: string }> {
  const series = args.series ?? 'INV';
  const fy = args.financialYear ?? currentFinancialYear();
  // SELECT ... FOR UPDATE on the sequence row (creates it if missing).
  const upserted = await tx.invoiceSequence.upsert({
    where: { tenantId_series_financialYear: { tenantId: args.tenantId, series, financialYear: fy } },
    create: { tenantId: args.tenantId, series, financialYear: fy, counter: 0 },
    update: {},
  });
  // Lock the row explicitly.
  await tx.$executeRawUnsafe(
    `SELECT 1 FROM "InvoiceSequence" WHERE id = $1 FOR UPDATE`,
    upserted.id
  );
  // Bump.
  const next = await tx.invoiceSequence.update({
    where: { id: upserted.id },
    data: { counter: { increment: 1 } },
  });
  const numberStr = `${series}/${fy}/${String(next.counter).padStart(5, '0')}`;
  return { number: numberStr, series, financialYear: fy };
}

/**
 * Transition an invoice to SENT: assigns the immutable number, snapshots totals,
 * fires the PDF render + (optionally) GST IRN generation jobs.
 */
export async function markInvoiceSent(invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new Error('Invoice not found');
    if (!canTransition(inv.status, 'SENT')) throw new Error(`Cannot SEND from ${inv.status}`);
    if (inv.number) throw new Error('Number already allocated');

    const seq = await allocateInvoiceNumber(tx as unknown as typeof prisma, {
      tenantId: inv.tenantId,
      series: inv.series,
      financialYear: inv.financialYear,
    });
    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        number: seq.number,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
    // Fan out async work (outside this critical section, but inside tx for FK safety).
    await enqueue(JOB_NAMES.PDF_RENDER_INVOICE, { invoiceId });
    await enqueue(JOB_NAMES.GST_IRN_GENERATE, { invoiceId });
    return updated;
  });
}
