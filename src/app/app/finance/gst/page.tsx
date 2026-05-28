import Link from 'next/link';
import { ShieldCheck, AlertCircle, FileText, ArrowUpRight } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { formatCurrency, timeAgo } from '@/lib/utils';

const GST_TURNOVER_THRESHOLD = 50_00_000; // ₹5 Cr — current IRN mandate

export default async function GstHubPage() {
  const ctx = await requireContext();
  const tenantId = ctx.tenant.id;

  const [
    irnedCount,
    pendingIrnInvoices,
    recentIrned,
    totalEligibleAgg,
  ] = await Promise.all([
    prisma.invoice.count({
      where: { tenantId, irn: { not: null }, type: 'TAX' },
    }),
    prisma.invoice.findMany({
      where: {
        tenantId,
        type: 'TAX',
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID'] },
        irn: null,
      },
      select: { id: true, number: true, total: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.invoice.findMany({
      where: { tenantId, irn: { not: null } },
      select: { id: true, number: true, irn: true, total: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.invoice.aggregate({
      where: { tenantId, type: 'TAX', status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID'] } },
      _sum: { total: true },
    }),
  ]);

  const turnoverEligible = ctx.tenant.gstinTurnover >= GST_TURNOVER_THRESHOLD;
  const provider = process.env.GST_IRP_PROVIDER || null;

  return (
    <div className="space-y-6">
      {/* Mandate banner */}
      <div className={`card p-5 flex items-start gap-3 ${turnoverEligible ? 'border-amber-500/40' : ''}`}>
        {turnoverEligible ? (
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        ) : (
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <div className="font-medium mb-1">
            {turnoverEligible
              ? 'You are under the GST e-invoicing mandate'
              : 'GST e-invoicing optional at your turnover'}
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Self-declared turnover:{' '}
            <strong>{formatCurrency(ctx.tenant.gstinTurnover, 'INR', ctx.tenant.locale)}</strong> ·
            current IRN mandate threshold is ₹5 Cr.{' '}
            {turnoverEligible
              ? 'Every B2B tax invoice must carry a valid IRN within 30 days of issue.'
              : 'IRN generation is still available — useful for B2B clients that require it.'}
          </p>
        </div>
        <Link href="/app/settings/workspace" className="btn-secondary text-xs py-1.5 px-2.5 shrink-0">
          Update
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="IRNs generated" value={irnedCount.toString()} hint="cumulative" />
        <Kpi
          label="Pending IRN"
          value={pendingIrnInvoices.length.toString()}
          hint={pendingIrnInvoices.length > 0 ? 'tax invoices without an IRN' : 'all caught up'}
          tone={pendingIrnInvoices.length > 0 ? 'warn' : 'ok'}
        />
        <Kpi
          label="Eligible value · pending"
          value={formatCurrency(
            pendingIrnInvoices.reduce((t, i) => t + i.total, 0),
            ctx.tenant.currency,
            ctx.tenant.locale
          )}
          hint={`of ${formatCurrency(totalEligibleAgg._sum.total ?? 0, ctx.tenant.currency, ctx.tenant.locale)} total`}
        />
      </div>

      {/* Provider connection status */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">IRP aggregator</h2>
          <Link
            href="/app/settings/integrations"
            className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
          >
            Configure <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {provider ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>
              Connected via <strong>{provider}</strong>
            </span>
          </div>
        ) : (
          <div className="text-sm text-[var(--color-muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--color-muted)]/40 inline-block mr-2" />
            No IRP aggregator configured. Set <code>GST_IRP_PROVIDER</code> and <code>GST_IRP_KEY</code>{' '}
            in environment to enable IRN generation.
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending list */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              Awaiting IRN
            </h2>
            <Link href="/app/invoices" className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1">
              All invoices <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {pendingIrnInvoices.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              No tax invoices waiting for an IRN.
            </p>
          ) : (
            <ul className="space-y-2">
              {pendingIrnInvoices.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {i.number ?? <span className="text-[var(--color-muted)]">unnumbered</span>}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">{timeAgo(i.createdAt)}</div>
                  </div>
                  <div className="text-sm font-semibold shrink-0">
                    {formatCurrency(i.total, ctx.tenant.currency, ctx.tenant.locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent IRN'd */}
        <div className="card p-6">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-emerald-400" />
            Recently e-invoiced
          </h2>
          {recentIrned.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              No IRNs generated yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentIrned.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.number ?? '—'}</div>
                    <div className="text-xs text-[var(--color-muted)] font-mono truncate">
                      IRN {i.irn?.slice(0, 16)}…
                    </div>
                  </div>
                  <div className="text-sm font-semibold shrink-0">
                    {formatCurrency(i.total, ctx.tenant.currency, ctx.tenant.locale)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="card p-5">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={
          'text-2xl font-semibold mt-1 ' +
          (tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-emerald-400' : '')
        }
      >
        {value}
      </div>
      {hint && <div className="text-xs text-[var(--color-muted)] mt-1">{hint}</div>}
    </div>
  );
}
