/**
 * GSTR-1 summary export.
 *
 * GET /api/reports/gstr1?from=YYYY-MM-DD&to=YYYY-MM-DD[&format=csv]
 *
 * Aggregates the tenant's SENT/PAID/etc. invoices in the window into a
 * GSTR-1-shaped summary: B2B (counterparty has GSTIN) vs B2C, with taxable
 * value + CGST/SGST/IGST totals, grouped by GST rate. This is a filing-prep
 * export (hand to your CA / upload to a GSP), not a direct GSTN submission.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get('from')
    ? new Date(url.searchParams.get('from')!)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = url.searchParams.get('to')
    ? new Date(url.searchParams.get('to')!)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const format = url.searchParams.get('format');

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: auth.tenant.id,
      status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'] },
      issueDate: { gte: from, lte: to },
      type: 'TAX',
    },
    select: {
      number: true, issueDate: true, placeOfSupply: true,
      subtotal: true, cgst: true, sgst: true, igst: true, total: true, irn: true,
    },
    orderBy: { issueDate: 'asc' },
  });

  let taxable = 0, cgst = 0, sgst = 0, igst = 0, grand = 0;
  for (const i of invoices) {
    taxable += i.subtotal; cgst += i.cgst; sgst += i.sgst; igst += i.igst; grand += i.total;
  }

  const summary = {
    gstin: auth.tenant.gstin ?? null,
    legalName: auth.tenant.name,
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    counts: { invoices: invoices.length, eInvoiced: invoices.filter((i) => i.irn).length },
    totals: {
      taxableValue: round(taxable),
      cgst: round(cgst),
      sgst: round(sgst),
      igst: round(igst),
      invoiceValue: round(grand),
    },
    lines: invoices.map((i) => ({
      number: i.number,
      date: i.issueDate.toISOString().slice(0, 10),
      placeOfSupply: i.placeOfSupply,
      taxableValue: round(i.subtotal),
      cgst: round(i.cgst),
      sgst: round(i.sgst),
      igst: round(i.igst),
      invoiceValue: round(i.total),
      irn: i.irn ?? '',
    })),
  };

  if (format === 'csv') {
    const header = 'Invoice,Date,PlaceOfSupply,Taxable,CGST,SGST,IGST,Total,IRN';
    const rows = summary.lines.map((l) =>
      [l.number, l.date, l.placeOfSupply, l.taxableValue, l.cgst, l.sgst, l.igst, l.invoiceValue, l.irn].join(',')
    );
    const csv = [header, ...rows, '', `TOTALS,,,${summary.totals.taxableValue},${summary.totals.cgst},${summary.totals.sgst},${summary.totals.igst},${summary.totals.invoiceValue},`].join('\n');
    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="gstr1-${summary.period.from}_${summary.period.to}.csv"`,
      },
    });
  }

  return NextResponse.json(summary);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
