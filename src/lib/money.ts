/**
 * Pure money math — the SINGLE source of truth for every amount in the app.
 *
 * This module has NO server-only imports (no prisma, no queue), so it is safe to
 * import from client components (e.g. the proposal portal) as well as API routes
 * and the invoice engine. Both `computeTotals` (proposals) and
 * `computeInvoiceTotals` (invoices) MUST funnel through `computeMoney` here so a
 * proposal's displayed total and its invoice/pay-link amount can never diverge.
 */

export interface MoneyLineItem {
  quantity: number;
  unitPrice: number;
  amount?: number;
}

export interface ComputeMoneyArgs {
  lineItems: MoneyLineItem[];
  taxRate: number; // percent, e.g. 18
  discount?: number;
  /** true → intra-state (CGST+SGST split), false → inter-state (IGST). */
  intraState?: boolean;
}

export interface MoneyTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The one calculation. `total` is ALWAYS `taxable + taxAmount` computed once, so
 * splitting tax into CGST/SGST can never cause the grand total to drift by a
 * rounding paisa. The split is derived for display: sgst = taxAmount - cgst.
 */
export function computeMoney(args: ComputeMoneyArgs): MoneyTotals {
  let subtotal = 0;
  for (const li of args.lineItems) {
    const amount = round2((li.quantity || 0) * (li.unitPrice || 0));
    li.amount = amount;
    subtotal += amount;
  }
  subtotal = round2(subtotal);
  const discount = round2(args.discount ?? 0);
  const taxable = Math.max(0, round2(subtotal - discount));
  const taxAmount = round2((taxable * (args.taxRate || 0)) / 100);
  const intra = args.intraState !== false;
  const cgst = intra ? round2(taxAmount / 2) : 0;
  const sgst = intra ? round2(taxAmount - cgst) : 0; // exact complement, no drift
  const igst = intra ? 0 : taxAmount;
  const total = round2(taxable + taxAmount);
  return { subtotal, discount, taxable, taxAmount, cgst, sgst, igst, total };
}
