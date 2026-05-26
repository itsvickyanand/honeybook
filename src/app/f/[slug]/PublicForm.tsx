'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'number';
  required?: boolean;
  options?: string[];
}

export function PublicForm({
  slug, title, description, fields, vendor, redirectUrl,
}: {
  slug: string;
  title: string;
  description: string | null;
  fields: FormField[];
  vendor: { name: string; accent: string };
  redirectUrl: string | null;
}) {
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  function set(name: string, v: string) { setValues((s) => ({ ...s, [name]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/by-slug/${slug}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setDone(true);
      if (data.redirectUrl) setTimeout(() => { window.location.href = data.redirectUrl; }, 1200);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSubmitting(false); }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="relative z-10 w-full max-w-md card p-10 text-center">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
          <Check className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">Thanks!</h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {vendor.name} will reach out to you shortly.
          {redirectUrl && ' Redirecting…'}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-lg">
      <div className="card p-8">
        <div className="flex items-center gap-2 mb-3">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: vendor.accent }}>
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{vendor.name}</span>
        </div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-2 text-sm text-[var(--color-muted)]">{description}</p>}

        <form onSubmit={submit} className="mt-6 space-y-4">
          {fields.map((f) => {
            if (f.type === 'textarea') return (
              <Textarea key={f.name} label={f.label} required={f.required} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
            );
            if (f.type === 'select') return (
              <Select key={f.name} label={f.label} required={f.required} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            );
            const type = f.type === 'phone' ? 'tel' : f.type;
            return (
              <Input key={f.name} label={f.label} type={type} required={f.required} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
            );
          })}
          <Button type="submit" loading={submitting} fullWidth>
            Submit
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
          Powered by Avantus
        </p>
      </div>
    </motion.div>
  );
}
