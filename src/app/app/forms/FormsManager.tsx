'use client';
/**
 * /app/forms — Lead capture overview.
 *
 * Matches the HoneyBook layout:
 *   - Lead forms / Contact forms sub-tabs (filtered by LeadForm.category)
 *   - Action filter pills (Services · Scheduler · Invoice · Questions)
 *   - List with inline status toggle + copy link
 *   - "+ Create new" categorized dropdown
 *   - Template preview modal with description + ACTIONS + iframe preview
 *
 * Customization: every starter template is just a starting set of fields. After
 * picking, the vendor lands in /app/forms/[id] — the existing editor — where
 * fields, copy, and actions can be changed freely.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Plus, ChevronDown, Copy, ExternalLink, Eye, Pencil, Search, Sparkles,
  Loader2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { STARTER_FORM_TEMPLATES, type StarterFormTemplate, type ActionTag } from '@/lib/forms/starter-templates';

interface FormRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  formType: string;
  category: string;
  actionsJson: unknown;
  fieldCount: number;
  createdAt: string;
}

const ACTION_FILTERS: ActionTag[] = ['Services', 'Scheduler', 'Invoice', 'Questions'];

export function FormsManager({ forms: initialForms }: { forms: FormRow[] }) {
  const router = useRouter();
  const [forms, setForms] = React.useState(initialForms);
  const [tab, setTab] = React.useState<'LEAD' | 'CONTACT'>('LEAD');
  const [filter, setFilter] = React.useState<ActionTag | null>(null);
  const [search, setSearch] = React.useState('');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [previewTpl, setPreviewTpl] = React.useState<StarterFormTemplate | null>(null);

  const visible = React.useMemo(() => {
    return forms.filter((f) => {
      if (f.category !== tab) return false;
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter) {
        const tags = inferTagsFromActions(f.actionsJson, f.formType);
        if (!tags.includes(filter)) return false;
      }
      return true;
    });
  }, [forms, tab, filter, search]);

  const drafts = visible.filter((f) => !f.active).length;
  const live = visible.filter((f) => f.active).length;

  function copyLink(slug: string) {
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success('Link copied'));
  }

  async function toggleActive(id: string, next: boolean) {
    setForms((arr) => arr.map((f) => (f.id === id ? { ...f, active: next } : f)));
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(next ? 'Form is live' : 'Form paused');
    } catch (e) {
      // revert on error
      setForms((arr) => arr.map((f) => (f.id === id ? { ...f, active: !next } : f)));
      toast.error((e as Error).message);
    }
  }

  return (
    <div>
      {/* Top bar — search + Create new */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search forms…"
            className="input-base w-full pl-9 text-sm"
          />
        </div>
        <CreateNewDropdown
          open={createOpen}
          onToggle={() => setCreateOpen((o) => !o)}
          onPick={(tpl) => { setCreateOpen(false); setPreviewTpl(tpl); }}
        />
      </div>

      {/* Sub-tabs */}
      <div className="mb-4 inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm">
        <button
          onClick={() => { setTab('LEAD'); setFilter(null); }}
          className={`rounded-lg px-3 py-1.5 ${tab === 'LEAD' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
        >
          Lead forms
        </button>
        <button
          onClick={() => { setTab('CONTACT'); setFilter(null); }}
          className={`rounded-lg px-3 py-1.5 ${tab === 'CONTACT' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
        >
          Contact forms
        </button>
      </div>

      {/* Filter pills */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--color-muted)]">Filter:</span>
        {ACTION_FILTERS.map((p) => (
          <button
            key={p}
            onClick={() => setFilter(filter === p ? null : p)}
            className={`chip transition ${filter === p ? 'border-[var(--color-primary)]/60 text-white' : 'hover:border-[var(--color-primary)]/40'}`}
          >
            {p}
          </button>
        ))}
        {filter && (
          <button onClick={() => setFilter(null)} className="text-xs text-[var(--color-muted)] hover:text-white">Clear</button>
        )}
      </div>

      {/* Count line */}
      <div className="mb-3 text-xs text-[var(--color-muted)]">
        {live} live · {drafts} draft{drafts === 1 ? '' : 's'}
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-sm text-[var(--color-muted)]">
            No {tab === 'LEAD' ? 'lead' : 'contact'} forms{filter ? ` with the "${filter}" action` : ''}.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((f) => (
            <li
              key={f.id}
              className="card flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <Link href={`/app/forms/${f.id}`} className="font-semibold hover:text-[var(--color-primary-soft)]">
                  {f.name}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  {inferTagsFromActions(f.actionsJson, f.formType).map((t) => (
                    <span key={t} className="chip">{t}</span>
                  ))}
                  <span className="text-[var(--color-muted)]">· {f.fieldCount} fields</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={f.active}
                    onChange={(e) => toggleActive(f.id, e.target.checked)}
                    className="h-4 w-7 appearance-none rounded-full bg-[var(--color-surface-2)] transition checked:bg-emerald-500"
                  />
                  {f.active ? <span className="text-emerald-400">Live</span> : <span className="text-[var(--color-muted)]">Paused</span>}
                </label>
                <button
                  onClick={() => copyLink(f.slug)}
                  className="btn-ghost text-xs"
                  title="Copy public link"
                >
                  <Copy className="h-3.5 w-3.5" /> Copy link
                </button>
                <Link href={`/f/${f.slug}`} target="_blank" className="btn-ghost text-xs" title="Open public form">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <Link href={`/app/forms/${f.id}`} className="btn-ghost text-xs" title="Edit form">
                  <Pencil className="h-3.5 w-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Template preview modal — HoneyBook-style "left description + right preview" */}
      <Modal
        open={!!previewTpl}
        onClose={() => setPreviewTpl(null)}
        title={null}
        size="xl"
      >
        {previewTpl && (
          <TemplatePreview
            template={previewTpl}
            onClose={() => setPreviewTpl(null)}
            onUse={async () => {
              try {
                const res = await fetch('/api/forms', {
                  method: 'POST', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ templateKey: previewTpl.key }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? 'Failed');
                toast.success('Template ready — customize the fields next');
                setPreviewTpl(null);
                router.push(`/app/forms/${data.form.id}`);
              } catch (e) { toast.error((e as Error).message); }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Create-new dropdown ────────────────────────────────────────────────────
function CreateNewDropdown({
  open, onToggle, onPick,
}: {
  open: boolean;
  onToggle: () => void;
  onPick: (tpl: StarterFormTemplate) => void;
}) {
  const leads = STARTER_FORM_TEMPLATES.filter((t) => t.category === 'LEAD');
  const contacts = STARTER_FORM_TEMPLATES.filter((t) => t.category === 'CONTACT');

  return (
    <div className="relative">
      <Button onClick={onToggle}>
        <Plus className="h-4 w-4" /> Create new <ChevronDown className="h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 text-sm shadow-xl">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Form types</div>
          {leads.map((tpl) => (
            <button
              key={tpl.key}
              onClick={() => onPick(tpl)}
              className="block w-full px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
            >
              {tpl.label}
            </button>
          ))}
          {contacts.length > 0 && (
            <>
              <div className="my-1 border-t border-[var(--color-border)]" />
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Contact</div>
              {contacts.map((tpl) => (
                <button
                  key={tpl.key}
                  onClick={() => onPick(tpl)}
                  className="block w-full px-3 py-1.5 text-left hover:bg-[var(--color-surface-2)]"
                >
                  {tpl.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Template preview modal content ─────────────────────────────────────────
function TemplatePreview({
  template, onClose, onUse,
}: {
  template: StarterFormTemplate;
  onClose: () => void;
  onUse: () => Promise<void>;
}) {
  const [device, setDevice] = React.useState<'desktop' | 'mobile'>('desktop');
  const [submitting, setSubmitting] = React.useState(false);

  async function handleUse() {
    setSubmitting(true);
    try { await onUse(); } finally { setSubmitting(false); }
  }

  return (
    <div className="flex h-[600px]">
      {/* Left column — description + actions + CTA */}
      <div className="w-80 shrink-0 border-r border-[var(--color-border)] p-6">
        <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          {template.category === 'CONTACT' ? 'Contact form' : 'Lead form'}
        </div>
        <h2 className="mt-2 text-2xl font-semibold">{template.label}</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{template.blurb}</p>

        {template.actionTags.length > 0 && (
          <>
            <div className="mt-6 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Actions</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {template.actionTags.map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-soft)]" />
                  {t}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* AI hint for the Quote request template */}
        {template.actions.some((a) => a.type === 'ai_draft_proposal') && (
          <div className="mt-6 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium text-[var(--color-primary-soft)]">
              <Sparkles className="h-3.5 w-3.5" /> AI auto-draft enabled
            </div>
            <p className="mt-1 text-[var(--color-muted)]">
              When the form is submitted, the AI will draft a proposal from the brief and attach it to the new lead.
            </p>
          </div>
        )}

        <Button onClick={handleUse} loading={submitting} className="mt-8 w-full">
          Use this template
        </Button>
        <p className="mt-2 text-center text-[10px] text-[var(--color-muted)]">
          Every field is editable after — pick this as a starting point.
        </p>
      </div>

      {/* Right column — live preview */}
      <div className="flex flex-1 flex-col bg-[var(--color-surface-2)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
          <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5 text-xs">
            <button
              onClick={() => setDevice('desktop')}
              className={`rounded px-2 py-1 ${device === 'desktop' ? 'bg-[var(--color-surface-2)]' : 'text-[var(--color-muted)]'}`}
            >Desktop</button>
            <button
              onClick={() => setDevice('mobile')}
              className={`rounded px-2 py-1 ${device === 'mobile' ? 'bg-[var(--color-surface-2)]' : 'text-[var(--color-muted)]'}`}
            >Mobile</button>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn-ghost text-xs">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div
            className={`mx-auto rounded-2xl bg-white p-8 text-[#111] shadow-xl ${device === 'mobile' ? 'max-w-[380px]' : 'max-w-md'}`}
          >
            <h3 className="text-xl font-semibold">{template.defaults.title}</h3>
            <p className="mt-1 text-sm text-[#666]">{template.defaults.description}</p>
            <div className="mt-5 space-y-3">
              {template.defaults.fields.map((f) => (
                <div key={f.name}>
                  <label className="text-xs font-medium text-[#444]">{f.label}{f.required && ' *'}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      readOnly
                      rows={3}
                      placeholder={f.placeholder ?? ''}
                      className="mt-1 w-full rounded-lg border border-[#ddd] bg-[#f6f6f6] p-2 text-sm"
                    />
                  ) : f.type === 'select' ? (
                    <select
                      disabled
                      className="mt-1 w-full rounded-lg border border-[#ddd] bg-[#f6f6f6] p-2 text-sm"
                    >
                      <option>Choose…</option>
                      {f.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      readOnly
                      type={f.type === 'phone' ? 'tel' : f.type}
                      placeholder={f.placeholder ?? ''}
                      className="mt-1 w-full rounded-lg border border-[#ddd] bg-[#f6f6f6] p-2 text-sm"
                    />
                  )}
                </div>
              ))}
              <button
                disabled
                className="mt-2 w-full rounded-lg bg-black px-4 py-2 text-sm text-white"
              >
                {template.formType === 'DISCOVERY_CALL' ? 'Next: pick a time' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function inferTagsFromActions(actionsJson: unknown, formType: string): ActionTag[] {
  const tags = new Set<ActionTag>();
  // Always include Questions if there are fields — every form asks something
  tags.add('Questions');
  if (Array.isArray(actionsJson)) {
    for (const a of actionsJson as { type?: string }[]) {
      if (a?.type === 'book_meeting') tags.add('Scheduler');
      if (a?.type === 'send_invoice') tags.add('Invoice');
      if (a?.type === 'ai_draft_proposal') tags.add('Services');
    }
  }
  // Per-formType fallback so older rows still surface meaningful tags.
  if (formType === 'DISCOVERY_CALL' || formType === 'INSTANT_BOOKING') tags.add('Scheduler');
  if (formType === 'QUOTE_REQUEST') tags.add('Services');
  return Array.from(tags);
}

// Avoid no-unused-import warnings.
void Eye; void Loader2;
