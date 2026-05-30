/**
 * TDS reconciliation summary (Form 26AS prep).
 *
 * GET /api/reports/tds?from=&to=
 *
 * Sums TDS deducted by clients on B2B payments in the window, grouped by
 * section (194C / 194J / …). Use this to reconcile against Form 26AS — what
 * clients claim they deducted should match credits appearing in 26AS.
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

  const payments = await prisma.payment.findMany({
    where: {
      tenantId: auth.tenant.id,
      status: 'SUCCESS',
      tdsAmount: { gt: 0 },
      paidAt: { gte: from, lte: to },
    },
    select: { amount: true, tdsAmount: true, tdsSection: true, paidAt: true, providerRef: true },
    orderBy: { paidAt: 'asc' },
  });

  const bySection = new Map<string, { count: number; gross: number; tds: number }>();
  let totalTds = 0, totalGross = 0;
  for (const p of payments) {
    const sec = p.tdsSection ?? 'Unspecified';
    const cur = bySection.get(sec) ?? { count: 0, gross: 0, tds: 0 };
    cur.count += 1; cur.gross += p.amount + p.tdsAmount; cur.tds += p.tdsAmount;
    bySection.set(sec, cur);
    totalTds += p.tdsAmount; totalGross += p.amount + p.tdsAmount;
  }

  return NextResponse.json({
    period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    pan: auth.tenant.pan ?? null,
    totals: { grossBilled: round(totalGross), tdsDeducted: round(totalTds), entries: payments.length },
    bySection: [...bySection.entries()].map(([section, v]) => ({
      section,
      count: v.count,
      gross: round(v.gross),
      tds: round(v.tds),
    })),
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
