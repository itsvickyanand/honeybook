'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Loader2,
  PhoneCall,
  Sparkles,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCallLogs } from '@/dialer';

interface CallLog {
  id: string;
  leadName?: string | null;
  toNumber?: string | null;
  status: string;
  durationSec?: number | null;
  createdAt: string;
  processingState: string;
  errorMessage?: string | null;
  recordingSid?: string | null;
  summary?: string | null;
  sentiment?: string | null;
  keyPoints?: unknown;
  actionItems?: unknown;
  transcript?: string | null;
}

const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  neutral: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
  negative: 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]',
  mixed: 'bg-[var(--color-warn)]/15 text-[var(--color-warn)]',
};

const STATUS_STYLE: Record<string, string> = {
  completed: 'text-[var(--color-success)]',
  'in-progress': 'text-[var(--color-primary-soft)]',
  busy: 'text-[var(--color-warn)]',
  'no-answer': 'text-[var(--color-warn)]',
  failed: 'text-[var(--color-danger)]',
  canceled: 'text-[var(--color-muted)]',
};

const PROCESSING_LABEL: Record<string, string> = {
  pending: 'Waiting for recording…',
  transcribing: 'Transcribing…',
  analyzing: 'Analyzing with AI…',
  error: 'Analysis failed',
};

const NO_RECORDING = new Set(['busy', 'no-answer', 'canceled', 'failed']);

function isProcessing(log: CallLog) {
  return (
    ['pending', 'transcribing', 'analyzing'].includes(log.processingState) &&
    !NO_RECORDING.has(log.status)
  );
}

function fmtDuration(sec?: number | null) {
  if (sec == null) return '—';
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Call history with recording, transcript, and AI analysis — styled to match
 * the app. Filter by contactId (Client), leadId, or destination phone. Drop it
 * into any detail page. Auto-polls while a call is still being processed.
 */
export function CallHistory({
  contactId,
  leadId,
  phone,
  className,
}: {
  contactId?: string;
  leadId?: string;
  phone?: string;
  className?: string;
}) {
  const { logs, loading, error } = useCallLogs({ contactId, leadId, phone }) as {
    logs: CallLog[];
    loading: boolean;
    error: string | null;
  };
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading call history…
      </p>
    );
  }
  if (error) {
    return (
      <p className="py-6 text-sm text-[var(--color-danger)]">
        Couldn&apos;t load calls: {error}
      </p>
    );
  }
  if (logs.length === 0) {
    return (
      <div className="py-10 text-center">
        <PhoneCall className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
        <p className="mt-2 text-sm text-[var(--color-muted)]">No calls yet.</p>
      </div>
    );
  }

  return (
    <ul className={cn('divide-y rounded-xl border overflow-hidden', className)}>
      {logs.map((log) => {
        const open = openId === log.id;
        return (
          <li key={log.id} className="bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : log.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--color-surface-2)]"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-primary-soft)]">
                <PhoneCall className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {log.leadName || log.toNumber || 'Unknown'}
                  <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                    {fmtDate(log.createdAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={STATUS_STYLE[log.status] || 'text-[var(--color-muted)]'}>
                    {log.status}
                  </span>
                  <span className="text-[var(--color-muted)]">
                    · {fmtDuration(log.durationSec)}
                  </span>
                  {isProcessing(log) && (
                    <span className="flex items-center gap-1 text-[var(--color-primary-soft)]">
                      · <Loader2 className="h-3 w-3 animate-spin" />
                      {PROCESSING_LABEL[log.processingState]}
                    </span>
                  )}
                </div>
              </div>
              {log.sentiment && (
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                    SENTIMENT_STYLE[log.sentiment] || SENTIMENT_STYLE.neutral
                  )}
                >
                  {log.sentiment}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-[var(--color-muted)] transition',
                  open && 'rotate-180'
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <LogDetail log={log} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function LogDetail({ log }: { log: CallLog }) {
  const processing = isProcessing(log);
  const keyPoints = asList(log.keyPoints);
  const actionItems = asList(log.actionItems);

  return (
    <div className="space-y-4 border-t px-4 py-4">
      {log.recordingSid ? (
        <audio
          controls
          preload="none"
          src={`/api/dialer/recording/${log.recordingSid}`}
          className="w-full"
        />
      ) : (
        <p className="text-sm text-[var(--color-muted)]">No recording.</p>
      )}

      {processing && (
        <p className="flex items-center gap-2 text-sm text-[var(--color-primary-soft)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {PROCESSING_LABEL[log.processingState]}
        </p>
      )}
      {log.processingState === 'error' && (
        <p className="rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {PROCESSING_LABEL.error}: {log.errorMessage}
        </p>
      )}

      {log.summary && (
        <div>
          <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            <Sparkles className="h-3.5 w-3.5" /> Summary
          </h4>
          <p className="text-sm">{log.summary}</p>
        </div>
      )}

      {keyPoints.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Key points
          </h4>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {actionItems.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Action items
          </h4>
          <ul className="space-y-1 text-sm">
            {actionItems.map((p, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-success)]" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      {log.transcript && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)] hover:text-[var(--color-text)]">
            <FileText className="h-3.5 w-3.5" /> Transcript
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
            {log.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}
