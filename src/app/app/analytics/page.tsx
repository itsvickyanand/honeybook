import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { AnalyticsClient } from './AnalyticsClient';
import { financialYearOf } from '@/lib/financial-year';

export default async function AnalyticsPage() {
  const ctx = await requireContext();

  // Revenue by month (paid invoices, last 12 months)
  const now = new Date();
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: ctx.tenant.id, status: 'PAID', issueDate: { gte: monthAgo } },
    select: { issueDate: true, total: true },
  });
  const revenueByMonth = new Map<string, number>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    const key = d.toLocaleString('en-IN', { month: 'short' });
    revenueByMonth.set(key, 0);
  }
  for (const inv of invoices) {
    const key = inv.issueDate.toLocaleString('en-IN', { month: 'short' });
    revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + inv.total);
  }
  const revenueSeries = Array.from(revenueByMonth.entries()).map(([month, revenue]) => ({ month, revenue }));

  // Proposal funnel
  const statusCounts = await prisma.proposal.groupBy({
    by: ['status'],
    where: { tenantId: ctx.tenant.id },
    _count: true,
  });
  const counts = new Map(statusCounts.map((s) => [s.status, s._count]));
  const funnel = [
    { stage: 'Drafts', count: (counts.get('DRAFT') ?? 0) + (counts.get('SENT') ?? 0) + (counts.get('VIEWED') ?? 0) + (counts.get('CHANGES_REQUESTED') ?? 0) + (counts.get('ACCEPTED') ?? 0) + (counts.get('DECLINED') ?? 0) },
    { stage: 'Sent', count: (counts.get('SENT') ?? 0) + (counts.get('VIEWED') ?? 0) + (counts.get('CHANGES_REQUESTED') ?? 0) + (counts.get('ACCEPTED') ?? 0) + (counts.get('DECLINED') ?? 0) },
    { stage: 'Viewed', count: (counts.get('VIEWED') ?? 0) + (counts.get('CHANGES_REQUESTED') ?? 0) + (counts.get('ACCEPTED') ?? 0) + (counts.get('DECLINED') ?? 0) },
    { stage: 'Accepted', count: counts.get('ACCEPTED') ?? 0 },
  ];

  // Receivables aging buckets
  const open = await prisma.invoice.findMany({
    where: { tenantId: ctx.tenant.id, status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] } },
    select: { total: true, amountPaid: true, dueDate: true },
  });
  const buckets = [{ band: 'Current', amount: 0 }, { band: '1-30d', amount: 0 }, { band: '31-60d', amount: 0 }, { band: '60+d', amount: 0 }];
  for (const inv of open) {
    const outstanding = inv.total - inv.amountPaid;
    if (outstanding <= 0) continue;
    if (!inv.dueDate) {
      buckets[0].amount += outstanding;
      continue;
    }
    const daysOver = Math.floor((Date.now() - inv.dueDate.getTime()) / 86_400_000);
    if (daysOver <= 0) buckets[0].amount += outstanding;
    else if (daysOver <= 30) buckets[1].amount += outstanding;
    else if (daysOver <= 60) buckets[2].amount += outstanding;
    else buckets[3].amount += outstanding;
  }

  // AI proposal acceptance rate (proposals SENT → ACCEPTED in last 90 days)
  const ninetyAgo = new Date(Date.now() - 90 * 86_400_000);
  const sent = await prisma.proposal.count({ where: { tenantId: ctx.tenant.id, sentAt: { gte: ninetyAgo } } });
  const accepted = await prisma.proposal.count({ where: { tenantId: ctx.tenant.id, status: 'ACCEPTED', sentAt: { gte: ninetyAgo } } });
  const acceptanceRate = sent === 0 ? 0 : Math.round((accepted / sent) * 1000) / 10;

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Analytics</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            FY {financialYearOf(now)} — revenue, funnel, receivables.
          </p>
        </div>
        <AnalyticsClient
          revenueSeries={revenueSeries}
          funnel={funnel}
          aging={buckets}
          acceptanceRate={acceptanceRate}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
