'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GripVertical, Eye, EyeOff, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Section { id: string; kind: string; visible: boolean; title?: string }
interface Theme { primary: string; accent: string }

const AVAILABLE_KINDS: { kind: string; label: string }[] = [
  { kind: 'hero', label: 'Hero' },
  { kind: 'scope', label: 'Scope & Pricing' },
  { kind: 'inclusions', label: "What's included" },
  { kind: 'terms', label: 'Terms' },
  { kind: 'gallery', label: 'Gallery' },
  { kind: 'visa', label: 'Visa documents' },
  { kind: 'documents', label: 'Documents' },
  { kind: 'pay', label: 'Pay block' },
  { kind: 'sign', label: 'Sign block' },
  { kind: 'chat', label: 'Chat' },
  { kind: 'cta', label: 'Final CTA' },
];

export function PortalBuilder({
  initialTheme, initialSections,
}: { initialTheme: Theme; initialSections: Section[] }) {
  const [theme, setTheme] = React.useState(initialTheme);
  const [sections, setSections] = React.useState(initialSections);
  const [saving, setSaving] = React.useState(false);

  function move(idx: number, delta: number) {
    setSections((s) => {
      const out = [...s];
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= out.length) return out;
      const [item] = out.splice(idx, 1);
      out.splice(newIdx, 0, item);
      return out;
    });
  }
  function toggle(id: string) {
    setSections((s) => s.map((x) => (x.id === id ? { ...x, visible: !x.visible } : x)));
  }
  function rename(id: string, title: string) {
    setSections((s) => s.map((x) => (x.id === id ? { ...x, title } : x)));
  }
  function remove(id: string) {
    setSections((s) => s.filter((x) => x.id !== id));
  }
  function add(kind: string) {
    if (sections.some((s) => s.kind === kind)) return;
    setSections((s) => [...s, { id: `sec-${kind}-${Date.now()}`, kind, visible: true, title: AVAILABLE_KINDS.find((k) => k.kind === kind)?.label }]);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/portal-template', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme, sections }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Portal template saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  const missing = AVAILABLE_KINDS.filter((k) => !sections.some((s) => s.kind === k.kind));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Theme</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-base">Primary</label>
              <input type="color" value={theme.primary} onChange={(e) => setTheme({ ...theme, primary: e.target.value })} className="h-10 w-full rounded-xl border bg-transparent" />
            </div>
            <div>
              <label className="label-base">Accent</label>
              <input type="color" value={theme.accent} onChange={(e) => setTheme({ ...theme, accent: e.target.value })} className="h-10 w-full rounded-xl border bg-transparent" />
            </div>
          </div>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold mb-4">Sections</h2>
          <div className="space-y-2">
            <AnimatePresence>
              {sections.map((s, idx) => (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  className="flex items-center gap-2 rounded-xl border bg-[var(--color-surface-2)] p-3"
                >
                  <div className="flex flex-col">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-[var(--color-muted)] hover:text-white disabled:opacity-30">▲</button>
                    <button onClick={() => move(idx, 1)} disabled={idx === sections.length - 1} className="text-[var(--color-muted)] hover:text-white disabled:opacity-30">▼</button>
                  </div>
                  <GripVertical className="h-4 w-4 text-[var(--color-muted)]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[var(--color-muted)]">{s.kind}</div>
                    <Input
                      className="h-8 mt-1"
                      value={s.title ?? ''}
                      placeholder="Section title"
                      onChange={(e) => rename(s.id, e.target.value)}
                    />
                  </div>
                  <button onClick={() => toggle(s.id)} className="btn-ghost p-1.5" aria-label="Toggle">
                    {s.visible ? <Eye className="h-4 w-4 text-emerald-400" /> : <EyeOff className="h-4 w-4 text-[var(--color-muted)]" />}
                  </button>
                  <button onClick={() => remove(s.id)} className="btn-ghost p-1.5 text-red-400" aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {missing.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-2">Add section</div>
              <div className="flex flex-wrap gap-2">
                {missing.map((k) => (
                  <button key={k.kind} onClick={() => add(k.kind)} className="chip hover:border-[var(--color-primary)]/60 hover:text-white transition">
                    <Plus className="h-3 w-3" /> {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button onClick={save} loading={saving} className="mt-4 w-full justify-center">
            <Save className="h-4 w-4" /> Save template
          </Button>
        </div>
      </div>

      <div className="lg:sticky lg:top-6 self-start">
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-[var(--color-surface-2)] text-xs text-[var(--color-muted)]">Preview</div>
          <div className="p-6 space-y-3 max-h-[600px] overflow-y-auto">
            {sections.filter((s) => s.visible).map((s) => (
              <div key={s.id} className="rounded-xl border bg-[var(--color-surface-2)] p-4">
                <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{s.kind}</div>
                <div className="mt-1 font-semibold" style={{ color: theme.accent }}>{s.title ?? AVAILABLE_KINDS.find((k) => k.kind === s.kind)?.label}</div>
              </div>
            ))}
            {sections.filter((s) => s.visible).length === 0 && (
              <p className="text-center text-sm text-[var(--color-muted)] py-12">No visible sections.</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
