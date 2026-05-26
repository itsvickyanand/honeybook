'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Mail, MessageSquare, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Seq { id: string; name: string; trigger: string; active: boolean; stepCount: number }

const CHANNEL_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail, whatsapp: MessageSquare, sms: Phone,
};

export function DripsList({ initial }: { initial: Seq[] }) {
  const router = useRouter();
  const [sequences, setSequences] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [trigger, setTrigger] = React.useState<'lead.created' | 'proposal.sent' | 'proposal.viewed' | 'manual'>('lead.created');
  const [steps, setSteps] = React.useState<{ channel: 'email' | 'whatsapp' | 'sms'; delayHours: number; subject?: string; body: string }[]>([
    { channel: 'email', delayHours: 0, subject: 'Thanks for reaching out', body: 'Hi {{name}}, we got your enquiry. Quick reply incoming.' },
    { channel: 'email', delayHours: 48, subject: 'Following up', body: 'Just checking in — did you have a chance to think it over?' },
  ]);
  const [saving, setSaving] = React.useState(false);

  function addStep() { setSteps((s) => [...s, { channel: 'email', delayHours: 24, subject: '', body: '' }]); }
  function rmStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i)); }
  function up(i: number, p: Partial<typeof steps[number]>) { setSteps((s) => s.map((x, idx) => idx === i ? { ...x, ...p } : x)); }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/drips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, trigger, steps, active: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Sequence created');
      setSequences((s) => [{ id: data.sequence.id, name, trigger, active: true, stepCount: steps.length }, ...s]);
      setOpen(false);
      setName('');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New sequence</Button>
      </div>
      {sequences.length === 0 ? (
        <div className="card p-12 text-center text-sm text-[var(--color-muted)]">
          No sequences yet. Create one to auto-follow-up with new leads.
        </div>
      ) : (
        sequences.map((s) => (
          <div key={s.id} className="card p-5 flex items-center gap-3">
            <div className="flex-1">
              <div className="font-semibold">{s.name}</div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">
                Trigger: <code>{s.trigger}</code> · {s.stepCount} step{s.stepCount === 1 ? '' : 's'}
              </div>
            </div>
            <span className={`chip ${s.active ? 'bg-emerald-500/20 text-emerald-300' : ''}`}>{s.active ? 'Active' : 'Paused'}</span>
          </div>
        ))
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New email sequence" size="lg">
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Select label="Trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as typeof trigger)}>
            <option value="lead.created">Lead created</option>
            <option value="proposal.sent">Proposal sent</option>
            <option value="proposal.viewed">Proposal viewed</option>
            <option value="manual">Manual</option>
          </Select>
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Steps</span>
              <Button variant="ghost" onClick={addStep}><Plus className="h-3 w-3" /> Add</Button>
            </div>
            {steps.map((s, i) => {
              const Icon = CHANNEL_ICON[s.channel];
              return (
                <div key={i} className="rounded-xl border bg-[var(--color-surface-2)] p-3 mb-2">
                  <div className="grid gap-2 md:grid-cols-12 items-start">
                    <Select className="md:col-span-3" value={s.channel} onChange={(e) => up(i, { channel: e.target.value as 'email' | 'whatsapp' | 'sms' })}>
                      <option value="email">Email</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="sms">SMS</option>
                    </Select>
                    <Input className="md:col-span-2" type="number" placeholder="Delay (hrs)" value={s.delayHours} onChange={(e) => up(i, { delayHours: Number(e.target.value) })} />
                    {s.channel === 'email' && (
                      <Input className="md:col-span-6" placeholder="Subject" value={s.subject ?? ''} onChange={(e) => up(i, { subject: e.target.value })} />
                    )}
                    <button onClick={() => rmStep(i)} className="md:col-span-1 btn-ghost p-2 text-red-400">×</button>
                  </div>
                  <Textarea placeholder="Body — supports {{name}}" value={s.body} onChange={(e) => up(i, { body: e.target.value })} className="mt-2" />
                  <div className="mt-1 text-xs text-[var(--color-muted)] flex items-center gap-1">
                    <Icon className="h-3 w-3" /> Step {i + 1} · fires after {s.delayHours}h
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!name.trim() || steps.length === 0}>Create</Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
