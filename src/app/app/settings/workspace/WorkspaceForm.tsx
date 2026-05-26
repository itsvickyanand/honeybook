'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { FileUpload } from '@/components/ui/FileUpload';

interface Cfg {
  name: string;
  taxLabel: string;
  taxRate: number;
  currency: string;
  locale: string;
  gstinTurnover: number;
  brandColor: string;
  logoUrl: string | null;
  region: string;
}

export function WorkspaceForm({ initial }: { initial: Cfg }) {
  const router = useRouter();
  const [cfg, setCfg] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Workspace saved');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
      <div className="card p-6 space-y-4">
        <Input label="Business name" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} />
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Tax label" value={cfg.taxLabel} onChange={(e) => setCfg({ ...cfg, taxLabel: e.target.value })} hint="GST in India, VAT in MENA" />
          <Input label="Tax rate %" type="number" value={cfg.taxRate} onChange={(e) => setCfg({ ...cfg, taxRate: Number(e.target.value) })} />
          <Input
            label="GSTIN turnover (₹)"
            type="number"
            value={cfg.gstinTurnover}
            onChange={(e) => setCfg({ ...cfg, gstinTurnover: Number(e.target.value) })}
            hint="Above ₹5Cr → IRN required (India)"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Select label="Currency" value={cfg.currency} onChange={(e) => setCfg({ ...cfg, currency: e.target.value })}>
            <option value="INR">INR — ₹</option>
            <option value="USD">USD — $</option>
            <option value="AED">AED — د.إ</option>
            <option value="SAR">SAR — ﷼</option>
          </Select>
          <Select label="Locale" value={cfg.locale} onChange={(e) => setCfg({ ...cfg, locale: e.target.value })}>
            <option value="en-IN">en-IN</option>
            <option value="en-US">en-US</option>
            <option value="ar-AE">ar-AE</option>
            <option value="hi-IN">hi-IN</option>
          </Select>
          <Select label="Region" value={cfg.region} onChange={(e) => setCfg({ ...cfg, region: e.target.value })}>
            <option value="IN">India</option>
            <option value="MENA">MENA</option>
          </Select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label-base">Brand color</label>
            <input type="color" value={cfg.brandColor} onChange={(e) => setCfg({ ...cfg, brandColor: e.target.value })} className="h-10 w-full rounded-xl border bg-transparent" />
          </div>
          <div>
            <label className="label-base">Logo</label>
            <div className="flex items-center gap-3">
              {cfg.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={cfg.logoUrl} alt="" className="h-12 w-12 rounded object-contain border" />
              ) : (
                <div className="h-12 w-12 rounded border bg-[var(--color-surface-2)] flex items-center justify-center text-xs text-[var(--color-muted)]">—</div>
              )}
              <FileUpload compact accept="image/*" prefix="brand" onUploaded={(f) => setCfg({ ...cfg, logoUrl: f.url })} />
            </div>
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Save workspace
        </Button>
      </div>
    </motion.div>
  );
}
