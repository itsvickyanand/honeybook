import Link from 'next/link';
import { Database, CheckCircle2, Circle, ArrowUpRight, ArrowRight } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { timeAgo } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  OK: 'bg-emerald-500/20 text-emerald-300',
  PENDING: 'bg-amber-500/20 text-amber-300',
  RETRYING: 'bg-amber-500/20 text-amber-300',
  FAILED: 'bg-red-500/20 text-red-300',
};

export default async function AccountingTabPage() {
  const ctx = await requireContext();
  const tenantId = ctx.tenant.id;

  const [connections, recentLogs, queuedCount] = await Promise.all([
    prisma.accountingConnection.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.accountingSyncLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    }),
    prisma.accountingSyncLog.count({
      where: { tenantId, status: { in: ['PENDING', 'RETRYING'] } },
    }),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--color-primary)]" />
              Recent sync activity
              {queuedCount > 0 && (
                <span className="chip text-xs">{queuedCount} queued</span>
              )}
            </h2>
            <Link
              href="/app/settings/integrations"
              className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
            >
              Manage <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--color-muted)]">
              No accounting sync activity yet. Connect Zoho or Tally to start syncing invoices.
            </p>
          ) : (
            <ul className="space-y-2">
              {recentLogs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2.5"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {log.entityType}
                      {log.externalId ? <span className="text-[var(--color-muted)] font-mono ml-1 text-xs">{log.externalId.slice(0, 14)}</span> : null}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {log.provider} · {timeAgo(log.createdAt)}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TONE[log.status] ?? 'bg-slate-500/20 text-slate-300'}`}>
                    {log.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Connected providers</h2>
          {connections.length === 0 ? (
            <div className="text-sm text-[var(--color-muted)]">
              <Circle className="h-4 w-4 inline mr-1.5" />
              None yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {connections.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg border bg-[var(--color-surface-2)]/30 px-3 py-2"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.provider}</div>
                    <div className="text-xs text-[var(--color-muted)] truncate">
                      Since {timeAgo(c.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/app/settings/integrations"
            className="btn-secondary text-sm py-2 px-3 w-full mt-4"
          >
            Connect provider <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-2">Tally bridge</h2>
          <p className="text-xs text-[var(--color-muted)] mb-3">
            For desktop Tally users — a paired agent on the Windows machine pulls XML envelopes from the platform.
          </p>
          <Link
            href="/app/settings/integrations"
            className="text-sm text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
          >
            Open agent setup <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
