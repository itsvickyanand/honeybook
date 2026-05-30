'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Star, Trash2, Save, Eye } from 'lucide-react';
import { MERGE_FIELDS, renderContract } from '@/lib/contracts-render';

interface T { id: string; name: string; bodyHtml: string; isDefault: boolean }

const SAMPLE = {
  clientName: 'Priya Sharma', vendorName: 'You', businessName: 'Your Business',
  projectName: 'Sangeet Night', total: '₹2,50,000', eventDate: '12 Dec 2026',
};

export function ContractsManager({ initial }: { initial: T[] }) {
  const router = useRouter();
  const [list, setList] = React.useState<T[]>(initial);
  const [activeId, setActiveId] = React.useState<string | null>(initial[0]?.id ?? null);
  const active = list.find((t) => t.id === activeId) ?? null;
  const [name, setName] = React.useState(active?.name ?? '');
  const [body, setBody] = React.useState(active?.bodyHtml ?? '');
  const [preview, setPreview] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(active?.name ?? '');
    setBody(active?.bodyHtml ?? '');
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create() {
    const res = await fetch('/api/contracts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'New contract' }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? 'Failed');
    setList((p) => [...p, { id: data.template.id, name: data.template.name, bodyHtml: data.template.bodyHtml, isDefault: data.template.isDefault }]);
    setActiveId(data.template.id);
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contracts/${active.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, bodyHtml: body }) });
      if (!res.ok) throw new Error();
      setList((p) => p.map((t) => (t.id === active.id ? { ...t, name, bodyHtml: body } : t)));
      toast.success('Saved');
    } catch { toast.error('Could not save'); } finally { setSaving(false); }
  }

  async function makeDefault() {
    if (!active) return;
    await fetch(`/api/contracts/${active.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ isDefault: true }) });
    setList((p) => p.map((t) => ({ ...t, isDefault: t.id === active.id })));
    toast.success('Set as default');
  }

  async function remove(id: string) {
    await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
    setList((p) => p.filter((t) => t.id !== id));
    if (activeId === id) setActiveId(list.find((t) => t.id !== id)?.id ?? null);
    router.refresh();
  }

  function insertField(f: string) { setBody((b) => b + ' ' + f); }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-2">
        {list.map((t) => (
          <button key={t.id} onClick={() => setActiveId(t.id)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${activeId === t.id ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'}`}>
            <span className="truncate">{t.name}</span>
            {t.isDefault && <Star className="h-3.5 w-3.5 text-amber-500" />}
          </button>
        ))}
        <button onClick={create} className="btn-ghost w-full justify-center text-sm"><Plus className="h-4 w-4" /> New contract</button>
      </aside>

      {active ? (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-base text-lg font-semibold" />
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => setPreview((p) => !p)} className="btn-ghost text-sm"><Eye className="h-4 w-4" /> {preview ? 'Edit' : 'Preview'}</button>
              {!active.isDefault && <button onClick={makeDefault} className="btn-ghost text-sm"><Star className="h-4 w-4" /> Set default</button>}
              <button onClick={() => remove(active.id)} className="btn-ghost text-sm text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {MERGE_FIELDS.map((f) => (
              <button key={f} onClick={() => insertField(f)} className="chip text-[11px] hover:border-[var(--color-primary)]/60" title="Insert field">{f}</button>
            ))}
          </div>

          {preview ? (
            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-white p-6 text-black" dangerouslySetInnerHTML={{ __html: renderContract(body, SAMPLE) }} />
          ) : (
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={20} className="input-base mt-4 font-mono text-xs" placeholder="Write your agreement in HTML. Use merge fields above." />
          )}

          <div className="mt-3 flex justify-end">
            <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="card p-8 text-center text-[var(--color-muted)]">Create a contract to get started.</div>
      )}
    </div>
  );
}
