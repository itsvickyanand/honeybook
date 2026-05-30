'use client';

/**
 * Financials actions for a project workspace.
 *
 * Lets a vendor collect money on a project even when it was started WITHOUT a
 * proposal/payment (e.g. via "Start project (no payment)"):
 *   - "Generate invoice"  → POST /api/invoices { projectId, lineItems }
 *                            creates an invoice tied to this project for the
 *                            outstanding balance (editable).
 *   - "Record payment"    → POST /api/payments/manual { invoiceId, amount, method }
 *                            any method (cash/UPI/cheque/net banking/bank
 *                            transfer/card/Razorpay) and any amount (partial OK),
 *                            reconciled inline.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Receipt, IndianRupee } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card, CardHeader } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

export interface FinInvoice {
  id: string;
  number: string | null;
  total: number;
  amountPaid: number;
  status: string;
}

const METHODS: { value: string; label: string }[] = [
  { value: 'RAZORPAY', label: 'Razorpay' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'NETBANKING', label: 'Net Banking' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
];

export function ProjectFinancials({
  projectId,
  projectName,
  quoted,
  totalPaid,
  balance,
  invoices,
  currency,
  locale,
}: {
  projectId: string;
  projectName: string;
  quoted: number;
  totalPaid: number;
  balance: number;
  invoices: FinInvoice[];
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [genOpen, setGenOpen] = React.useState(false);
  const [payFor, setPayFor] = React.useState<FinInvoice | null>(null);

  // Invoice to default the "Record payment" action to: the first unpaid one.
  const firstUnpaid = invoices.find((i) => i.status !== 'PAID' && i.status !== 'VOID');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Quoted" value={formatCurrency(quoted, currency, locale)} />
        <Stat label="Paid" value={formatCurrency(totalPaid, currency, locale)} accent="emerald" />
        <Stat label="Balance" value={formatCurrency(balance, currency, locale)} accent={balance > 0 ? 'amber' : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setGenOpen(true)}>
          <Receipt className="h-4 w-4" /> Generate invoice
        </Button>
        {firstUnpaid && (
          <Button onClick={() => setPayFor(firstUnpaid)}>
            <IndianRupee className="h-4 w-4" /> Record payment
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="Invoices" description="Collect part or full payment by any method." />
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No invoices yet. Generate one to start collecting payments — partial amounts are fine.
          </p>
        ) : (
          <ul className="space-y-2">
            {invoices.map((inv) => {
              const bal = Math.max(0, inv.total - inv.amountPaid);
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <Link href={`/app/invoices/${inv.id}`} className="hover:underline">
                    {inv.number ?? 'Draft'} <span className="chip ml-1 text-[10px]">{inv.status.replace('_', ' ')}</span>
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="text-right tabular-nums">
                      <div>{formatCurrency(inv.total, currency, locale)}</div>
                      {inv.amountPaid > 0 && (
                        <div className="text-xs text-emerald-500">Paid {formatCurrency(inv.amountPaid, currency, locale)}</div>
                      )}
                    </div>
                    {bal > 0 && inv.status !== 'VOID' && (
                      <button
                        onClick={() => setPayFor(inv)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs transition hover:border-[var(--color-primary)]/60"
                      >
                        <Plus className="h-3 w-3" /> Pay
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <GenerateInvoiceModal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        projectId={projectId}
        projectName={projectName}
        defaultAmount={balance > 0 ? balance : quoted}
        currency={currency}
        locale={locale}
        onDone={() => router.refresh()}
      />
      <RecordPaymentModal
        invoice={payFor}
        onClose={() => setPayFor(null)}
        currency={currency}
        locale={locale}
        onDone={() => router.refresh()}
      />
    </div>
  );
}

function GenerateInvoiceModal({
  open, onClose, projectId, projectName, defaultAmount, currency, locale, onDone,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  defaultAmount: number;
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const [desc, setDesc] = React.useState('');
  const [amount, setAmount] = React.useState(String(Math.round(defaultAmount)));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDesc(`${projectName} — services`);
      setAmount(String(Math.round(defaultAmount)));
    }
  }, [open, defaultAmount, projectName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          lineItems: [
            { name: desc || 'Services', quantity: 1, unit: 'item', unitPrice: Number(amount) },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Invoice generated');
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate invoice">
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Creates a draft invoice tied to this project. Taxes apply per your GST settings.
        Outstanding balance: <strong>{formatCurrency(defaultAmount, currency, locale)}</strong>
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} required />
        <Input label="Amount (pre-tax)" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <div className="flex justify-end gap-2 border-t pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!amount || Number(amount) <= 0}>Generate</Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({
  invoice, onClose, currency, locale, onDone,
}: {
  invoice: FinInvoice | null;
  onClose: () => void;
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const balance = invoice ? Math.max(0, invoice.total - invoice.amountPaid) : 0;
  const [amount, setAmount] = React.useState('0');
  const [method, setMethod] = React.useState('RAZORPAY');
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (invoice) {
      setAmount(String(Math.max(0, invoice.total - invoice.amountPaid)));
      setNote('');
    }
  }, [invoice]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setSaving(true);
    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          amount: Number(amount),
          method,
          paidAt: new Date(paidAt).toISOString(),
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Payment recorded');
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!invoice} onClose={onClose} title="Record payment">
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Outstanding balance: <strong>{formatCurrency(balance, currency, locale)}</strong>. Partial payments are fine.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METHODS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </Select>
        <Input label="Paid at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2 border-t pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!amount || Number(amount) <= 0}>Record</Button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'amber' ? 'text-amber-500' : '';
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
