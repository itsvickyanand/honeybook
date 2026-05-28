'use client';

/**
 * Interactive islands for the workspace detail page:
 *  - StageSelect      → change delivery stage (PATCH /api/projects/[id])
 *  - ProjectActivity  → feed + note/email composer
 *  - ProjectNotes     → autosaving notes textarea
 *  - TagEditor        → add/remove tags
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, StickyNote, Send, X } from 'lucide-react';

const STAGES = [
  { key: 'KICKOFF', name: 'Kick off' },
  { key: 'ONBOARDING', name: 'Onboarding' },
  { key: 'PLANNING', name: 'Planning' },
  { key: 'DELIVERY', name: 'Delivery' },
  { key: 'COMPLETED', name: 'Completed' },
  { key: 'ARCHIVED', name: 'Archived' },
];

export function StageSelect({ projectId, value }: { projectId: string; value: string }) {
  const router = useRouter();
  const [stage, setStage] = React.useState(value);
  const [saving, setSaving] = React.useState(false);
  async function change(next: string) {
    setStage(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setStage(value);
      toast.error('Could not update stage');
    } finally {
      setSaving(false);
    }
  }
  return (
    <select
      value={stage}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      className="input-base w-full text-sm"
    >
      {STAGES.map((s) => (
        <option key={s.key} value={s.key}>{s.name}</option>
      ))}
    </select>
  );
}

interface ActivityRow {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
}

export function ProjectActivity({
  projectId,
  initial,
  clientEmail,
}: {
  projectId: string;
  initial: ActivityRow[];
  clientEmail: string | null;
}) {
  const [items, setItems] = React.useState<ActivityRow[]>(initial);
  const [mode, setMode] = React.useState<'NOTE' | 'EMAIL'>('NOTE');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: mode, body, subject: subject || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setItems((p) => [data.activity, ...p]);
      setBody('');
      setSubject('');
      toast.success(mode === 'EMAIL' ? 'Email sent to client' : 'Note added');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Composer */}
      <div className="card p-3">
        <div className="mb-2 flex gap-1">
          <button
            onClick={() => setMode('NOTE')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${mode === 'NOTE' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
          >
            <StickyNote className="h-3.5 w-3.5" /> Note
          </button>
          <button
            onClick={() => setMode('EMAIL')}
            disabled={!clientEmail}
            title={clientEmail ? '' : 'Client has no email on file'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm disabled:opacity-40 ${mode === 'EMAIL' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
          >
            <Mail className="h-3.5 w-3.5" /> Email client
          </button>
        </div>
        {mode === 'EMAIL' && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="input-base mb-2 text-sm"
          />
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={mode === 'EMAIL' ? `Write to ${clientEmail ?? 'client'}…` : 'Log a note about this project…'}
          className="input-base text-sm"
        />
        <div className="mt-2 flex justify-end">
          <button onClick={submit} disabled={busy || !body.trim()} className="btn-primary text-sm">
            <Send className="h-3.5 w-3.5" /> {mode === 'EMAIL' ? 'Send' : 'Add note'}
          </button>
        </div>
      </div>

      {/* Feed */}
      <ol className="relative space-y-3 border-l border-[var(--color-border)] pl-5">
        {items.length === 0 && (
          <li className="text-sm text-[var(--color-muted)]">No activity yet.</li>
        )}
        {items.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
            <div className="text-sm font-medium">{a.title}</div>
            {a.body && <div className="mt-0.5 whitespace-pre-wrap text-sm text-[var(--color-muted)]">{a.body}</div>}
            <div className="mt-0.5 text-xs text-[var(--color-muted)]">
              {a.user?.fullName ? `${a.user.fullName} · ` : ''}
              {new Date(a.createdAt).toLocaleString()}
              <span className="ml-2 chip text-[10px]">{a.type}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function ProjectNotes({ projectId, initial }: { projectId: string; initial: string }) {
  const [text, setText] = React.useState(initial);
  const [savedText, setSavedText] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    if (text === savedText) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notesText: text }),
      });
      if (!res.ok) throw new Error();
      setSavedText(text);
      toast.success('Notes saved');
    } catch {
      toast.error('Could not save notes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        rows={12}
        placeholder="Private notes about this project (only your team can see these)…"
        className="input-base text-sm"
      />
      <div className="mt-2 flex items-center justify-between text-xs text-[var(--color-muted)]">
        <span>Autosaves when you click away.</span>
        <button onClick={save} disabled={saving || text === savedText} className="btn-ghost text-xs">
          {saving ? 'Saving…' : text === savedText ? 'Saved' : 'Save now'}
        </button>
      </div>
    </div>
  );
}

export function TagEditor({ projectId, initial }: { projectId: string; initial: string[] }) {
  const [tags, setTags] = React.useState<string[]>(initial);
  const [input, setInput] = React.useState('');

  async function persist(next: string[]) {
    setTags(next);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      });
    } catch {
      toast.error('Could not update tags');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span key={t} className="chip inline-flex items-center gap-1 text-xs">
          {t}
          <button onClick={() => persist(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            if (!tags.includes(input.trim())) persist([...tags, input.trim()]);
            setInput('');
          }
        }}
        placeholder="Add tag…"
        className="bg-transparent text-xs outline-none placeholder:text-[var(--color-muted)]"
      />
    </div>
  );
}
