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
  gstin?: string | null;
  pan?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  invoiceFooter?: string | null;
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
      {/* Billing identity — appears on invoices + payment receipts */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="font-semibold">Billing identity</h3>
          <p className="text-sm text-[var(--color-muted)]">Appears on every invoice you issue.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="GSTIN" value={cfg.gstin ?? ''} onChange={(e) => setCfg({ ...cfg, gstin: e.target.value || null })} hint="15-char GST identification number (India)" />
          <Input label="PAN" value={cfg.pan ?? ''} onChange={(e) => setCfg({ ...cfg, pan: e.target.value || null })} />
        </div>
        <Input label="Address line 1" value={cfg.addressLine1 ?? ''} onChange={(e) => setCfg({ ...cfg, addressLine1: e.target.value || null })} />
        <Input label="Address line 2" value={cfg.addressLine2 ?? ''} onChange={(e) => setCfg({ ...cfg, addressLine2: e.target.value || null })} />
        <div className="grid gap-4 md:grid-cols-4">
          <Input label="City" value={cfg.city ?? ''} onChange={(e) => setCfg({ ...cfg, city: e.target.value || null })} />
          <Input label="State" value={cfg.state ?? ''} onChange={(e) => setCfg({ ...cfg, state: e.target.value || null })} />
          <Input label="Postal code" value={cfg.postalCode ?? ''} onChange={(e) => setCfg({ ...cfg, postalCode: e.target.value || null })} />
          <Input label="Country" value={cfg.country ?? 'IN'} onChange={(e) => setCfg({ ...cfg, country: e.target.value || null })} hint="ISO-2 (e.g. IN, AE)" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Contact email" type="email" value={cfg.contactEmail ?? ''} onChange={(e) => setCfg({ ...cfg, contactEmail: e.target.value || null })} hint="Shown on invoices + receipts" />
          <Input label="Contact phone" value={cfg.contactPhone ?? ''} onChange={(e) => setCfg({ ...cfg, contactPhone: e.target.value || null })} />
          <Input label="Website" type="url" value={cfg.websiteUrl ?? ''} onChange={(e) => setCfg({ ...cfg, websiteUrl: e.target.value || null })} />
        </div>
        <div>
          <label className="label-base">Invoice footer</label>
          <textarea
            className="input-base"
            rows={2}
            placeholder="Thank you for your business. Bank: HDFC ... · UPI: business@upi"
            value={cfg.invoiceFooter ?? ''}
            onChange={(e) => setCfg({ ...cfg, invoiceFooter: e.target.value || null })}
          />
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
