'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';

interface Rule { id?: string; name: string; field: string; op: 'eq' | 'gt' | 'lt' | 'contains'; value: string; points: number; active: boolean }

export function ScoringEditor({ initial }: { initial: Rule[] }) {
  const [rules, setRules] = React.useState<Rule[]>(initial);
  const [saving, setSaving] = React.useState(false);

  function up(i: number, p: Partial<Rule>) { setRules((a) => a.map((r, idx) => idx === i ? { ...r, ...p } : r)); }
  function add() { setRules((a) => [...a, { name: 'New rule', field: 'source', op: 'eq', value: '', points: 10, active: true }]); }
  function rm(i: number) { setRules((a) => a.filter((_, idx) => idx !== i)); }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/lead-scoring', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules }) });
      if (!res.ok) throw new Error('Failed');
      toast.success('Rules saved');
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-3">
      {rules.map((r, i) => (
        <div key={i} className="card p-4 grid gap-2 md:grid-cols-12 items-start">
          <Input className="md:col-span-3" placeholder="Rule name" value={r.name} onChange={(e) => up(i, { name: e.target.value })} />
          <Input className="md:col-span-2" placeholder="Field" value={r.field} onChange={(e) => up(i, { field: e.target.value })} />
          <Select className="md:col-span-2" value={r.op} onChange={(e) => up(i, { op: e.target.value as Rule['op'] })}>
            <option value="eq">equals</option>
            <option value="contains">contains</option>
            <option value="gt">greater than</option>
            <option value="lt">less than</option>
          </Select>
          <Input className="md:col-span-2" placeholder="Value" value={r.value} onChange={(e) => up(i, { value: e.target.value })} />
          <Input className="md:col-span-2" type="number" placeholder="Points" value={r.points} onChange={(e) => up(i, { points: Number(e.target.value) })} />
          <button onClick={() => rm(i)} className="md:col-span-1 btn-ghost p-2 text-red-400"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex justify-between gap-2">
        <Button variant="ghost" onClick={add}><Plus className="h-4 w-4" /> Add rule</Button>
        <Button onClick={save} loading={saving}><Save className="h-4 w-4" /> Save</Button>
      </div>
    </motion.div>
  );
}
