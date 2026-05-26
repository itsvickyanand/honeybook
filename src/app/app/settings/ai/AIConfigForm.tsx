'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';

interface Cfg {
  tone: string;
  upsellAggressiveness: number;
  marginFloorPct: number;
  customInstructions: string;
  mandatoryItemSlugs: string[];
  blacklistedItemSlugs: string[];
  embeddingModel: string;
  embeddingDim: number;
}

export function AIConfigForm({ initial }: { initial: Cfg }) {
  const [cfg, setCfg] = React.useState<Cfg>(initial);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/ai-config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tone: cfg.tone,
          upsellAggressiveness: cfg.upsellAggressiveness,
          marginFloorPct: cfg.marginFloorPct,
          customInstructions: cfg.customInstructions,
          mandatoryItemSlugs: cfg.mandatoryItemSlugs,
          blacklistedItemSlugs: cfg.blacklistedItemSlugs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('AI config saved');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
      <div className="card p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--color-primary-soft)]" /> Voice
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Select label="Tone" value={cfg.tone} onChange={(e) => setCfg({ ...cfg, tone: e.target.value })}>
            <option value="warm-professional">Warm & Professional</option>
            <option value="casual">Casual</option>
            <option value="luxury">Luxury</option>
            <option value="minimal">Minimal</option>
          </Select>
          <Select
            label="Upsell aggressiveness"
            value={String(cfg.upsellAggressiveness)}
            onChange={(e) => setCfg({ ...cfg, upsellAggressiveness: Number(e.target.value) })}
          >
            <option value="0">Off — only what the brief asks</option>
            <option value="1">Subtle</option>
            <option value="2">Balanced</option>
            <option value="3">Aggressive — suggest premium add-ons</option>
          </Select>
        </div>
        <div className="mt-4">
          <Textarea
            label="Custom instructions"
            hint="Anything else the AI should know — house style, recurring exceptions, etc."
            value={cfg.customInstructions}
            onChange={(e) => setCfg({ ...cfg, customInstructions: e.target.value })}
          />
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Commercial rules</h2>
        <Input
          label="Margin floor (%)"
          type="number"
          hint="The AI won't propose discounts that drop overall margin below this."
          value={cfg.marginFloorPct}
          onChange={(e) => setCfg({ ...cfg, marginFloorPct: Number(e.target.value) || 0 })}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Input
            label="Mandatory item slugs (comma-separated)"
            hint="Always include these. e.g. service-charge, coordinator"
            value={cfg.mandatoryItemSlugs.join(', ')}
            onChange={(e) =>
              setCfg({
                ...cfg,
                mandatoryItemSlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              })
            }
          />
          <Input
            label="Blacklisted item slugs (comma-separated)"
            hint="Never include these."
            value={cfg.blacklistedItemSlugs.join(', ')}
            onChange={(e) =>
              setCfg({
                ...cfg,
                blacklistedItemSlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
              })
            }
          />
        </div>
      </div>

      <div className="card p-6 bg-[var(--color-surface-2)]">
        <h2 className="font-semibold mb-2">Embedding model</h2>
        <p className="text-sm text-[var(--color-muted)]">
          {cfg.embeddingModel} · {cfg.embeddingDim}d. Changing this requires a tenant-wide reindex
          and a vector-column ALTER. Contact ops for now.
        </p>
      </div>

      <div className="flex justify-end">
        <Button loading={saving} onClick={save}>
          <Save className="h-4 w-4" /> Save AI config
        </Button>
      </div>
    </motion.div>
  );
}
