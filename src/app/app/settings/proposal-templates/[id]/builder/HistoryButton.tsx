'use client';
/**
 * History dropdown — lists the last 5 snapshots and lets the user restore one.
 * Snapshots are written server-side on every save (TB-22). Restoring snapshots
 * the current state first so the restore itself is undoable.
 */
import * as React from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface Version {
  id: string;
  label: string | null;
  createdAt: string;
}

export function HistoryButton({
  templateId, onRestored,
}: {
  templateId: string;
  /** Called after a successful restore so the Builder can re-fetch blocks. */
  onRestored: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [versions, setVersions] = React.useState<Version[]>([]);
  const [restoringId, setRestoringId] = React.useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/versions`);
      const data = await res.json();
      if (res.ok) setVersions(data.versions ?? []);
    } finally { setLoading(false); }
  }

  function toggle() {
    if (!open) load();
    setOpen((o) => !o);
  }

  async function restore(versionId: string) {
    if (!confirm('Restore this version? The current state will be saved as a snapshot first so you can undo.')) return;
    setRestoringId(versionId);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/versions/${versionId}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Restore failed');
      }
      toast.success('Restored');
      setOpen(false);
      onRestored();
    } catch (e) { toast.error((e as Error).message); }
    finally { setRestoringId(null); }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost text-sm" title="Restore an earlier version">
        <History className="h-4 w-4" /> History
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-xl">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-[var(--color-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : versions.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-muted)]">
              No saved versions yet.<br />Save once to start tracking history.
            </div>
          ) : (
            <ul>
              {versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-[var(--color-surface-2)]">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">
                      {v.label ?? 'Autosave'}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {new Date(v.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => restore(v.id)}
                    disabled={!!restoringId}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] hover:border-[var(--color-primary)]/60 disabled:opacity-50"
                  >
                    {restoringId === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
