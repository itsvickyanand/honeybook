'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Trash2, Receipt, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';

const IN_STATES = [
  ['IN-AN','Andaman & Nicobar'],['IN-AP','Andhra Pradesh'],['IN-AR','Arunachal Pradesh'],['IN-AS','Assam'],
  ['IN-BR','Bihar'],['IN-CH','Chandigarh'],['IN-CT','Chhattisgarh'],['IN-DH','Dadra & Nagar Haveli'],
  ['IN-DD','Daman & Diu'],['IN-DL','Delhi'],['IN-GA','Goa'],['IN-GJ','Gujarat'],['IN-HR','Haryana'],
  ['IN-HP','Himachal Pradesh'],['IN-JK','Jammu & Kashmir'],['IN-JH','Jharkhand'],['IN-KA','Karnataka'],
  ['IN-KL','Kerala'],['IN-LD','Lakshadweep'],['IN-MP','Madhya Pradesh'],['IN-MH','Maharashtra'],['IN-MN','Manipur'],
  ['IN-ML','Meghalaya'],['IN-MZ','Mizoram'],['IN-NL','Nagaland'],['IN-OR','Odisha'],['IN-PY','Puducherry'],
  ['IN-PB','Punjab'],['IN-RJ','Rajasthan'],['IN-SK','Sikkim'],['IN-TN','Tamil Nadu'],['IN-TG','Telangana'],
  ['IN-TR','Tripura'],['IN-UP','Uttar Pradesh'],['IN-UT','Uttarakhand'],['IN-WB','West Bengal'],
];

interface Line {
  name: string;
  description?: string;
  hsn?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
}

export function NewInvoiceForm({
  contacts, tenantPlaceOfSupply, taxLabel, taxRate, currency, locale,
}: {
  contacts: { id: string; fullName: string; email: string | null }[];
  tenantPlaceOfSupply: string;
  taxLabel: string;
  taxRate: number;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState('');
  const [type, setType] = React.useState<'TAX' | 'PROFORMA'>('TAX');
  const [series, setSeries] = React.useState('INV');
  const [placeOfSupply, setPlaceOfSupply] = React.useState(tenantPlaceOfSupply);
  const [billTo, setBillTo] = React.useState(tenantPlaceOfSupply);
  const [dueDate, setDueDate] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [lines, setLines] = React.useState<Line[]>([{ name: '', quantity: 1, unit: 'unit', unitPrice: 0 }]);
  const [saving, setSaving] = React.useState(false);

  const subtotal = lines.reduce((t, l) => t + l.quantity * l.unitPrice, 0);
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;
  const sameState = placeOfSupply === billTo;

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx: number) { setLines((arr) => arr.filter((_, i) => i !== idx)); }
  function addLine() { setLines((arr) => [...arr, { name: '', quantity: 1, unit: 'unit', unitPrice: 0 }]); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contactId: contactId || undefined,
          type, series, placeOfSupply, billToPlaceOfSupply: billTo,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          lineItems: lines.filter((l) => l.name.trim() && l.unitPrice > 0),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Invoice draft created');
      router.push(`/app/invoices/${data.invoice.id}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">New invoice</h1>
          <p className="mt-1 text-[var(--color-muted)]">Drafts get a number when you send.</p>
        </div>
        <Receipt className="h-8 w-8 text-[var(--color-muted)]" />
      </div>

      <form onSubmit={submit} className="space-y-6">
        <div className="card p-6 grid gap-4 md:grid-cols-2">
          <Select label="Client" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">— pick a client —</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
          </Select>
          <Select label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="TAX">Tax Invoice</option>
            <option value="PROFORMA">Proforma Invoice</option>
          </Select>
          <Input label="Series" value={series} onChange={(e) => setSeries(e.target.value)} />
          <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Select label="Place of supply (vendor)" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)}>
            {IN_STATES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </Select>
          <Select label="Bill-to state (client)" value={billTo} onChange={(e) => setBillTo(e.target.value)}>
            {IN_STATES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </Select>
          <div className="md:col-span-2">
            <span className="chip">
              {sameState ? `Intra-state · CGST ${taxRate/2}% + SGST ${taxRate/2}%` : `Inter-state · IGST ${taxRate}%`}
            </span>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4">Line items</h2>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 md:grid-cols-12 items-start rounded-xl border bg-[var(--color-surface-2)] p-3">
                <div className="md:col-span-4">
                  <Input placeholder="Item" value={l.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Input placeholder="HSN/SAC" value={l.hsn ?? ''} onChange={(e) => updateLine(i, { hsn: e.target.value })} />
                </div>
                <div className="md:col-span-1">
                  <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-2">
                  <Input placeholder="Unit" value={l.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <Input type="number" step="any" placeholder="Unit price" value={l.unitPrice} onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) || 0 })} />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button type="button" onClick={() => removeLine(i)} className="btn-ghost p-2 text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" onClick={addLine} className="w-full justify-center">
              <Plus className="h-4 w-4" /> Add line item
            </Button>
          </div>
        </div>

        <div className="card p-6 grid gap-4 md:grid-cols-3">
          <Textarea label="Notes / terms" value={notes} onChange={(e) => setNotes(e.target.value)} className="md:col-span-2" />
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal</span><span>{formatCurrency(subtotal, currency, locale)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-muted)]">{taxLabel} ({taxRate}%)</span><span>{formatCurrency(tax, currency, locale)}</span></div>
            <div className="pt-2 mt-2 border-t flex justify-between"><span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Total</span><span className="text-xl font-semibold">{formatCurrency(total, currency, locale)}</span></div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="submit" loading={saving} disabled={subtotal <= 0}>
            Save draft <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
