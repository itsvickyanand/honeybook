'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Star, Trash2, Save, Eye } from 'lucide-react';
import { MERGE_FIELDS, renderTemplate, type ProposalVars } from '@/lib/proposals/render';

const TONES = ['warm', 'formal', 'concise', 'playful'] as const;
const SECTION_KEYS = ['cover', 'about', 'sections', 'inclusions', 'terms', 'cta'] as const;
const SECTION_LABEL: Record<string, string> = {
  cover: 'Cover',
  about: 'About us',
  sections: 'Quote sections',
  inclusions: "What's included",
  terms: 'Terms',
  cta: 'Next steps / CTA',
};

interface T {
  id: string; name: string; description: string | null;
  coverHtml: string; aboutHtml: string | null; defaultIntro: string | null;
  defaultInclusions: string[]; defaultTerms: string[];
  defaultValidityDays: number; defaultDepositPercent: number | null;
  coverImageUrl: string | null; accentColor: string | null; showLogo: boolean;
  toneHint: string; housePhrases: string[]; alwaysIncludeItems: string[];
  sectionOrder: string[]; isDefault: boolean;
}

const SAMPLE: ProposalVars = {
  clientName: 'Priya & Arjun', vendorName: 'You', businessName: 'Your Business',
  projectName: 'Sangeet Night', total: '₹2,50,000', eventDate: '12 Dec 2026',
};

export function Manager({ initial }: { initial: T[] }) {
  const router = useRouter();
  const [list, setList] = React.useState<T[]>(initial);
  const [activeId, setActiveId] = React.useState<string | null>(initial[0]?.id ?? null);
  const active = list.find((t) => t.id === activeId) ?? null;
  const [tab, setTab] = React.useState<'content' | 'design' | 'ai' | 'sections'>('content');
  const [preview, setPreview] = React.useState(false);

  async function create() {
    const res = await fetch('/api/proposal-templates', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New template' }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? 'Failed');
    setList((p) => [...p, data.template]);
    setActiveId(data.template.id);
  }

  async function patch(patch: Partial<T>) {
    if (!active) return;
    setList((p) => p.map((t) => (t.id === active.id ? { ...t, ...patch } : t)));
    try {
      const res = await fetch(`/api/proposal-templates/${active.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
    } catch { toast.error('Could not save'); }
  }

  async function makeDefault() {
    if (!active) return;
    await fetch(`/api/proposal-templates/${active.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isDefault: true }),
    });
    setList((p) => p.map((t) => ({ ...t, isDefault: t.id === active.id })));
    toast.success('Set as default');
  }

  async function remove(id: string) {
    await fetch(`/api/proposal-templates/${id}`, { method: 'DELETE' });
    setList((p) => p.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(list.find((t) => t.id !== id)?.id ?? null);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        {list.map((t) => (
          <button key={t.id} onClick={() => setActiveId(t.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${activeId === t.id ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'}`}>
            <span className="truncate">{t.name}</span>
            {t.isDefault && <Star className="h-3.5 w-3.5 text-amber-500" />}
          </button>
        ))}
        <button onClick={create} className="btn-ghost w-full justify-center text-sm"><Plus className="h-4 w-4" /> New template</button>
      </aside>

      {active ? (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <input value={active.name} onChange={(e) => patch({ name: e.target.value })} className="input-base text-lg font-semibold" />
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setPreview((p) => !p)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> {preview ? 'Edit' : 'Preview'}</button>
              {!active.isDefault && <button onClick={makeDefault} className="btn-ghost text-sm"><Star className="h-4 w-4" /> Set default</button>}
              <button onClick={() => remove(active.id)} className="btn-ghost text-sm text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-4 flex gap-1 border-b border-[var(--color-border)]">
            {(['content', 'design', 'ai', 'sections'] as const).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`px-3 pb-2 text-sm capitalize transition ${tab === k ? 'border-b-2 border-[var(--color-primary)] font-medium' : 'text-[var(--color-muted)]'}`}>
                {k}
              </button>
            ))}
          </div>

          {preview ? (
            <Preview active={active} />
          ) : tab === 'content' ? (
            <ContentTab active={active} patch={patch} />
          ) : tab === 'design' ? (
            <DesignTab active={active} patch={patch} />
          ) : tab === 'ai' ? (
            <AITab active={active} patch={patch} />
          ) : (
            <SectionsTab active={active} patch={patch} />
          )}
        </div>
      ) : (
        <div className="card p-8 text-center text-[var(--color-muted)]">Create a template to get started.</div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
function ContentTab({ active, patch }: { active: T; patch: (p: Partial<T>) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <Field label="Cover HTML (uses merge fields)">
        <textarea value={active.coverHtml} onChange={(e) => patch({ coverHtml: e.target.value })} rows={6} className="input-base font-mono text-xs" />
      </Field>
      <Field label="About us (optional)">
        <textarea value={active.aboutHtml ?? ''} onChange={(e) => patch({ aboutHtml: e.target.value })} rows={4} className="input-base font-mono text-xs" />
      </Field>
      <Field label="Default intro paragraph (used by the AI as opener)">
        <textarea value={active.defaultIntro ?? ''} onChange={(e) => patch({ defaultIntro: e.target.value })} rows={3} className="input-base text-sm" />
      </Field>
      <ListEditor label="Default inclusions (one per line)" value={active.defaultInclusions} onChange={(v) => patch({ defaultInclusions: v })} placeholder="Setup and teardown" />
      <ListEditor label="Default terms (one per line)" value={active.defaultTerms} onChange={(v) => patch({ defaultTerms: v })} placeholder="50% retainer to confirm" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default validity (days)">
          <input type="number" min={1} max={180} value={active.defaultValidityDays} onChange={(e) => patch({ defaultValidityDays: Math.max(1, Number(e.target.value || 14)) })} className="input-base text-sm" />
        </Field>
        <Field label="Default deposit %">
          <input type="number" min={0} max={100} value={active.defaultDepositPercent ?? 0} onChange={(e) => patch({ defaultDepositPercent: Number(e.target.value) || null })} className="input-base text-sm" />
        </Field>
      </div>
      <MergeFieldsHint />
    </div>
  );
}

function DesignTab({ active, patch }: { active: T; patch: (p: Partial<T>) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <Field label="Cover image URL">
        <input value={active.coverImageUrl ?? ''} onChange={(e) => patch({ coverImageUrl: e.target.value || null })} placeholder="https://…/hero.jpg" className="input-base text-sm" />
      </Field>
      <Field label="Accent color">
        <div className="flex items-center gap-2">
          <input type="color" value={active.accentColor ?? '#8b5cf6'} onChange={(e) => patch({ accentColor: e.target.value })} className="h-8 w-12 cursor-pointer rounded" />
          <input value={active.accentColor ?? '#8b5cf6'} onChange={(e) => patch({ accentColor: e.target.value })} className="input-base text-sm" />
        </div>
      </Field>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active.showLogo} onChange={(e) => patch({ showLogo: e.target.checked })} />
        Include logo on cover
      </label>
    </div>
  );
}

function AITab({ active, patch }: { active: T; patch: (p: Partial<T>) => void }) {
  return (
    <div className="mt-4 space-y-4">
      <Field label="Tone">
        <select value={active.toneHint} onChange={(e) => patch({ toneHint: e.target.value })} className="input-base text-sm">
          {TONES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
      </Field>
      <ListEditor label="House phrases (the AI will weave these in naturally — one per line)" value={active.housePhrases} onChange={(v) => patch({ housePhrases: v })} placeholder="every detail accounted for" />
      <ListEditor label="Always include catalog items (slugs or row IDs — one per line)" value={active.alwaysIncludeItems} onChange={(v) => patch({ alwaysIncludeItems: v })} placeholder="setup-fee" />
    </div>
  );
}

function SectionsTab({ active, patch }: { active: T; patch: (p: Partial<T>) => void }) {
  const order = active.sectionOrder.length ? active.sectionOrder : [...SECTION_KEYS];
  function move(i: number, delta: number) {
    const next = [...order];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ sectionOrder: next });
  }
  function toggle(key: string) {
    patch({ sectionOrder: order.includes(key) ? order.filter((k) => k !== key) : [...order, key] });
  }
  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs text-[var(--color-muted)]">Drag the order with the arrows. Toggle a section off if you never use it.</p>
      <ul className="space-y-1.5">
        {order.map((key, i) => (
          <li key={key} className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            <span className="flex-1">{SECTION_LABEL[key] ?? key}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} className="btn-ghost px-1 text-xs disabled:opacity-30">↑</button>
            <button onClick={() => move(i, +1)} disabled={i === order.length - 1} className="btn-ghost px-1 text-xs disabled:opacity-30">↓</button>
            <button onClick={() => toggle(key)} className="btn-ghost px-2 text-xs">Remove</button>
          </li>
        ))}
      </ul>
      <div className="text-xs text-[var(--color-muted)]">
        Available: {SECTION_KEYS.filter((k) => !order.includes(k)).map((k) => (
          <button key={k} onClick={() => toggle(k)} className="chip ml-1 text-[10px]">+ {SECTION_LABEL[k]}</button>
        ))}
      </div>
    </div>
  );
}

function Preview({ active }: { active: T }) {
  const html = renderTemplate(active.coverHtml, SAMPLE);
  const about = active.aboutHtml ? renderTemplate(active.aboutHtml, SAMPLE) : '';
  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-6 text-black" style={{ borderTop: `4px solid ${active.accentColor ?? '#8b5cf6'}` }}>
      {active.coverImageUrl && <div className="mb-4 h-32 rounded-lg" style={{ background: `url(${active.coverImageUrl}) center/cover` }} />}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {about && <div className="mt-4" dangerouslySetInnerHTML={{ __html: about }} />}
      {active.defaultInclusions.length > 0 && (
        <>
          <h2 className="mt-6 text-lg font-semibold" style={{ color: active.accentColor ?? '#8b5cf6' }}>What's included</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {active.defaultInclusions.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </>
      )}
      {active.defaultTerms.length > 0 && (
        <>
          <h2 className="mt-6 text-lg font-semibold" style={{ color: active.accentColor ?? '#8b5cf6' }}>Terms</h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {active.defaultTerms.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── helpers ───
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}

function ListEditor({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <textarea
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
        rows={Math.min(8, Math.max(3, value.length + 1))}
        placeholder={placeholder}
        className="input-base text-sm"
      />
    </Field>
  );
}

function MergeFieldsHint() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-[11px] text-[var(--color-muted)]">
      Merge fields: {MERGE_FIELDS.map((f) => <code key={f} className="mr-1.5">{f}</code>)}
    </div>
  );
}

export type { T as Template };
