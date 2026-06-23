'use client';
/**
 * Form submissions analytics tab.
 *
 * Reads the FormSubmission rows written by the action runtime in Phase 2.
 * Top headline: total submissions, conversion to lead, conversion to proposal.
 * Below: collapsible rows with the raw payload + action results trace.
 */
import * as React from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface SubmissionRow {
  id: string;
  createdAt: string;
  payloadJson: Record<string, string>;
  contactId: string | null;
  leadId: string | null;
  proposalId: string | null;
  actionResultsJson: { type: string; ok: boolean; error?: string; durationMs: number }[] | null;
}

export function SubmissionsTab({ submissions }: { submissions: SubmissionRow[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const stats = React.useMemo(() => {
    const total = submissions.length;
    const withLead = submissions.filter((s) => !!s.leadId).length;
    const withProposal = submissions.filter((s) => !!s.proposalId).length;
    const last7 = submissions.filter((s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86400_000).length;
    return { total, withLead, withProposal, last7 };
  }, [submissions]);

  if (submissions.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
        <Loader2 className="mx-auto mb-3 h-6 w-6 opacity-50" />
        No submissions yet. Share the public URL to start collecting.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total submissions" value={String(stats.total)} />
        <Stat label="Last 7 days" value={String(stats.last7)} />
        <Stat label="Converted to lead" value={`${stats.withLead}${stats.total > 0 ? ` · ${Math.round((stats.withLead / stats.total) * 100)}%` : ''}`} />
        <Stat label="With proposal drafted" value={`${stats.withProposal}${stats.total > 0 ? ` · ${Math.round((stats.withProposal / stats.total) * 100)}%` : ''}`} />
      </div>

      {/* Submissions list */}
      <ul className="space-y-2">
        {submissions.map((s) => {
          const isOpen = expanded === s.id;
          const name = s.payloadJson?.name ?? s.payloadJson?.fullName ?? 'Anonymous';
          const contact = s.payloadJson?.email ?? s.payloadJson?.phone ?? '';
          return (
            <li key={s.id} className="card overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : s.id)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-[var(--color-surface-2)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{name}</span>
                    {contact && <span className="text-xs text-[var(--color-muted)]">{contact}</span>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {s.leadId && <span className="chip text-[10px]">Lead</span>}
                  {s.proposalId && <span className="chip text-[10px] border-[var(--color-primary)]/40 text-[var(--color-primary-soft)]">Proposal</span>}
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4 text-xs">
                  <div>
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Submitted fields</div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                      {Object.entries(s.payloadJson ?? {}).map(([k, v]) => (
                        <React.Fragment key={k}>
                          <dt className="text-[var(--color-muted)]">{k}</dt>
                          <dd className="truncate font-mono">{String(v)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                  {s.actionResultsJson && s.actionResultsJson.length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Actions ran</div>
                      <ul className="space-y-1">
                        {s.actionResultsJson.map((r, i) => (
                          <li key={i} className="flex items-center gap-2">
                            {r.ok ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <XCircle className="h-3 w-3 text-red-400" />}
                            <span className="font-mono">{r.type}</span>
                            <span className="text-[var(--color-muted)]">· {r.durationMs}ms</span>
                            {r.error && <span className="text-red-300">· {r.error}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
