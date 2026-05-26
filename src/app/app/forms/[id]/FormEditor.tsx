'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save, Copy, ExternalLink } from 'lucide-react';
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

export function FormEditor({
  id, name: initName, slug, title, description, active, fields: initFields, redirectUrl,
}: {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  description: string | null;
  active: boolean;
  fields: Field[];
  redirectUrl: string | null;
}) {
  const [name, setName] = React.useState(initName);
  const [t, setT] = React.useState(title ?? '');
  const [desc, setDesc] = React.useState(description ?? '');
  const [act, setAct] = React.useState(active);
  const [redir, setRedir] = React.useState(redirectUrl ?? '');
  const [fields, setFields] = React.useState<Field[]>(initFields);
  const [saving, setSaving] = React.useState(false);

  function update(i: number, patch: Partial<Field>) {
    setFields((arr) => arr.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) { setFields((arr) => arr.filter((_, idx) => idx !== i)); }
  function add() { setFields((arr) => [...arr, { name: `field_${arr.length + 1}`, label: 'New field', type: 'text' }]); }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/forms/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, title: t || null, description: desc || null, fields, redirectUrl: redir || null, active: act }),
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

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Fields</h2>
        <div className="space-y-2">
          {fields.map((f, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-12 items-start rounded-xl border bg-[var(--color-surface-2)] p-3">
              <Input className="md:col-span-3" placeholder="name" value={f.name} onChange={(e) => update(i, { name: e.target.value })} />
              <Input className="md:col-span-3" placeholder="Label" value={f.label} onChange={(e) => update(i, { label: e.target.value })} />
              <Select className="md:col-span-2" value={f.type} onChange={(e) => update(i, { type: e.target.value })}>
                {['text','email','phone','textarea','select','number'].map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!f.required} onChange={(e) => update(i, { required: e.target.checked })} /> required
              </label>
              <Input
                className="md:col-span-1"
                placeholder="Options"
                value={(f.options ?? []).join(',')}
                onChange={(e) => update(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                disabled={f.type !== 'select'}
              />
              <button onClick={() => remove(i)} className="md:col-span-1 btn-ghost p-2 text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="ghost" onClick={add} className="w-full justify-center"><Plus className="h-4 w-4" /> Add field</Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save form</Button>
      </div>
    </motion.div>
  );
}
