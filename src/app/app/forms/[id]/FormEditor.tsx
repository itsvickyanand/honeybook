'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Plus, Trash2, Save, Copy, ExternalLink,
  ChevronUp, ChevronDown, GripVertical, Sparkles,
  UserPlus, Calendar, Mail, MailPlus, Send, ExternalLink as Redirect, Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';

interface Field {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  options?: string[];
}

/** All known action types. Order matters — this drives the "Add action" picker. */
const ACTION_CATALOG: {
  type: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  blockedFor?: ('LEAD' | 'CONTACT')[];
}[] = [
  { type: 'create_lead', label: 'Create lead', description: 'Add a new lead to your pipeline.', icon: UserPlus, blockedFor: ['CONTACT'] },
  { type: 'create_contact_only', label: 'Save contact only', description: 'No lead — just a contact in your address book.', icon: UserPlus },
  { type: 'ai_draft_proposal', label: 'AI draft proposal', description: 'Auto-draft a proposal from the brief using your catalog.', icon: Wand2, blockedFor: ['CONTACT'] },
  { type: 'book_meeting', label: 'Book meeting', description: 'Show the scheduler so the visitor can pick a slot.', icon: Calendar },
  { type: 'enroll_drip', label: 'Enroll in drip sequence', description: 'Automatically start an email follow-up sequence.', icon: MailPlus },
  { type: 'notify_internal', label: 'Notify your team', description: 'Push a notification when the form is submitted.', icon: Mail },
  { type: 'redirect', label: 'Redirect after submit', description: 'Send the visitor to a custom URL after submit.', icon: Redirect },
];

interface ActionRow {
  type: string;
  props?: Record<string, unknown>;
}

export function FormEditor({
  id, name: initName, slug, title, description, active, fields: initFields, redirectUrl,
  actions: initActions, category, meetingTypes, dripSequences,
}: {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  description: string | null;
  active: boolean;
  fields: Field[];
  redirectUrl: string | null;
  actions: ActionRow[];
  category: 'LEAD' | 'CONTACT';
  meetingTypes: { id: string; name: string; slug: string }[];
  dripSequences: { id: string; name: string; trigger: string }[];
}) {
  const [name, setName] = React.useState(initName);
  const [t, setT] = React.useState(title ?? '');
  const [desc, setDesc] = React.useState(description ?? '');
  const [act, setAct] = React.useState(active);
  const [redir, setRedir] = React.useState(redirectUrl ?? '');
  const [fields, setFields] = React.useState<Field[]>(initFields);
  const [actions, setActions] = React.useState<ActionRow[]>(initActions);
  const [saving, setSaving] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  function update(i: number, patch: Partial<Field>) {
    setFields((arr) => arr.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) { setFields((arr) => arr.filter((_, idx) => idx !== i)); }
  function add() { setFields((arr) => [...arr, { name: `field_${arr.length + 1}`, label: 'New field', type: 'text' }]); }

  // ─── Action mutators ───────────────────────────────────────────────────────
  function addAction(type: string) {
    setActions((arr) => [...arr, { type, props: {} }]);
    setAddOpen(false);
  }
  function removeAction(i: number) {
    setActions((arr) => arr.filter((_, idx) => idx !== i));
  }
  function moveAction(i: number, delta: 1 | -1) {
    setActions((arr) => {
      const next = arr.slice();
      const target = i + delta;
      if (target < 0 || target >= next.length) return arr;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }
  function patchActionProps(i: number, patch: Record<string, unknown>) {
    setActions((arr) => arr.map((a, idx) => (idx === i ? { ...a, props: { ...(a.props ?? {}), ...patch } } : a)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name, title: t || null, description: desc || null,
          fields, redirectUrl: redir || null, active: act,
          actions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/f/${slug}` : `/f/${slug}`;
  const embedCode = `<iframe src="${publicUrl}" width="100%" height="640" style="border:0;border-radius:16px"></iframe>`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Card 1 — basics */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-xl font-semibold" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={act} onChange={(e) => setAct(e.target.checked)} />
            Active
          </label>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Title (shown to visitors)" value={t} onChange={(e) => setT(e.target.value)} />
          <Input label="Redirect after submit (optional)" value={redir} onChange={(e) => setRedir(e.target.value)} type="url" />
        </div>
        <Textarea label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} className="mt-4" />

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/f/${slug}`} target="_blank" className="btn-secondary">
            <ExternalLink className="h-4 w-4" /> Open public form
          </Link>
          <button onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success('URL copied'); }} className="btn-ghost">
            <Copy className="h-4 w-4" /> Copy URL
          </button>
          <button onClick={() => { navigator.clipboard.writeText(embedCode); toast.success('Embed code copied'); }} className="btn-ghost">
            <Copy className="h-4 w-4" /> Copy embed
          </button>
        </div>
      </div>

      {/* Card 2 — fields */}
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Fields</h2>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-12 items-center rounded-xl border bg-[var(--color-surface-2)] p-3">
              <div className="md:col-span-3">
                <Input placeholder="Field key (e.g. name)" value={f.name} onChange={(e) => update(i, { name: e.target.value })} />
              </div>
              <div className="md:col-span-3">
                <Input placeholder="Label" value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Select value={f.type} onChange={(e) => update(i, { type: e.target.value })}>
                  {['text','email','phone','textarea','select','number'].map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!f.required} onChange={(e) => update(i, { required: e.target.checked })} /> required
              </label>
              <div className="md:col-span-1">
                <Input
                  placeholder="Options"
                  value={(f.options ?? []).join(',')}
                  onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  disabled={f.type !== 'select'}
                  title="Comma-separated options (for select type)"
                />
              </div>
              <button onClick={() => remove(i)} className="md:col-span-1 btn-ghost p-2 text-red-400 justify-self-end" aria-label="Remove field">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={add} className="w-full justify-center"><Plus className="h-4 w-4" /> Add field</Button>
        </div>
      </div>

      {/* Card 3 — actions (Phase 2) */}
      <div className="card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--color-primary-soft)]" /> Actions
          </h2>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            Run in order on submit
          </span>
        </div>
        <p className="mb-4 text-xs text-[var(--color-muted)]">
          Actions run top-to-bottom whenever someone submits this form. If one fails, the rest still run.
        </p>

        {actions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] p-6 text-center text-sm text-[var(--color-muted)]">
            No actions yet. The form will create a lead by default.
          </div>
        ) : (
          <ul className="space-y-2">
            {actions.map((a, i) => {
              const meta = ACTION_CATALOG.find((c) => c.type === a.type);
              const Icon = meta?.icon ?? Send;
              return (
                <li key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
                  <div className="flex items-start gap-3">
                    <GripVertical className="mt-1 h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                    <Icon className="mt-1 h-4 w-4 shrink-0 text-[var(--color-primary-soft)]" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{meta?.label ?? a.type}</div>
                      <div className="text-xs text-[var(--color-muted)]">{meta?.description ?? 'Custom action'}</div>
                      <ActionPropsEditor
                        action={a}
                        meetingTypes={meetingTypes}
                        dripSequences={dripSequences}
                        onPatch={(patch) => patchActionProps(i, patch)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveAction(i, -1)}
                        disabled={i === 0}
                        className="btn-ghost p-1 disabled:opacity-30"
                        aria-label="Move up"
                      ><ChevronUp className="h-3 w-3" /></button>
                      <button
                        onClick={() => moveAction(i, 1)}
                        disabled={i === actions.length - 1}
                        className="btn-ghost p-1 disabled:opacity-30"
                        aria-label="Move down"
                      ><ChevronDown className="h-3 w-3" /></button>
                    </div>
                    <button
                      onClick={() => removeAction(i)}
                      className="btn-ghost p-1 text-red-400"
                      aria-label="Remove action"
                    ><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="relative mt-3">
          <Button variant="ghost" onClick={() => setAddOpen((o) => !o)} className="w-full justify-center">
            <Plus className="h-4 w-4" /> Add action
          </Button>
          {addOpen && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-1 text-sm shadow-xl">
              {ACTION_CATALOG.filter((c) => !c.blockedFor?.includes(category)).map((c) => {
                const Icon = c.icon;
                return (
                  <button
                    key={c.type}
                    onClick={() => addAction(c.type)}
                    className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-[var(--color-surface-2)]"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-[var(--color-muted)]">{c.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save form</Button>
      </div>
    </motion.div>
  );
}

// ─── Per-action props editor ────────────────────────────────────────────────
function ActionPropsEditor({
  action, meetingTypes, dripSequences, onPatch,
}: {
  action: ActionRow;
  meetingTypes: { id: string; name: string; slug: string }[];
  dripSequences: { id: string; name: string; trigger: string }[];
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  if (action.type === 'book_meeting') {
    const slug = (action.props?.meetingTypeSlug as string) ?? '';
    return (
      <div className="mt-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          Which meeting type
        </label>
        <Select
          value={slug}
          onChange={(e) => onPatch({ meetingTypeSlug: e.target.value || null })}
          className="mt-1 text-xs"
        >
          <option value="">Auto-pick first active</option>
          {meetingTypes.map((m) => <option key={m.id} value={m.slug}>{m.name} ({m.slug})</option>)}
        </Select>
        {meetingTypes.length === 0 && (
          <p className="mt-1 text-[11px] text-amber-400">
            No meeting types configured yet. Add one under <Link href="/app/settings/scheduling" className="underline">Scheduling</Link>.
          </p>
        )}
      </div>
    );
  }

  if (action.type === 'enroll_drip') {
    const ids = Array.isArray(action.props?.sequenceIds) ? (action.props!.sequenceIds as string[]) : [];
    const trigger = (action.props?.trigger as string) ?? 'lead.created';
    return (
      <div className="mt-2 space-y-2">
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            Specific sequences (optional)
          </label>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
            {dripSequences.length === 0 ? (
              <p className="text-[11px] text-[var(--color-muted)]">No sequences set up. Vendor will use trigger fallback.</p>
            ) : dripSequences.map((s) => {
              const checked = ids.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...ids, s.id]
                        : ids.filter((x) => x !== s.id);
                      onPatch({ sequenceIds: next.length ? next : undefined });
                    }}
                  />
                  {s.name} <span className="text-[10px] text-[var(--color-muted)]">· {s.trigger}</span>
                </label>
              );
            })}
          </div>
        </div>
        {ids.length === 0 && (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Or use trigger (when no sequence chosen)
            </label>
            <Input
              value={trigger}
              onChange={(e) => onPatch({ trigger: e.target.value })}
              className="mt-1 text-xs"
              placeholder="lead.created"
            />
          </div>
        )}
      </div>
    );
  }

  if (action.type === 'redirect') {
    const url = (action.props?.url as string) ?? '';
    return (
      <div className="mt-2">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Redirect URL</label>
        <Input
          value={url}
          onChange={(e) => onPatch({ url: e.target.value })}
          placeholder="https://example.com/thanks"
          className="mt-1 text-xs"
        />
      </div>
    );
  }

  // Default: no extra props
  return null;
}
