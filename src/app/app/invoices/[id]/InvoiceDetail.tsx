'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, CheckCircle2, Ban, Plus, FileMinus, RefreshCw, Download, Mail, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Invoice {
  id: string;
  number: string | null;
  type: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  amountPaid: number;
  placeOfSupply: string;
  irn: string | null;
  content: { lineItems?: Array<{ name: string; quantity: number; unit: string; unitPrice: number; amount: number }>; notes?: string };
}

const TONE: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  VIEWED: 'bg-purple-500/20 text-purple-300',
  PARTIALLY_PAID: 'bg-amber-500/20 text-amber-300',
  PAID: 'bg-emerald-500/20 text-emerald-300',
  OVERDUE: 'bg-red-500/20 text-red-300',
  VOID: 'bg-slate-500/10 text-slate-400',
};

export function InvoiceDetail({
  invoice,
  payments,
  currency,
  locale,
  proposalTitle,
}: {
  invoice: Invoice;
  payments: { id: string; amount: number; method: string; status: string; provider: string | null; paidAt: string | null }[];
  currency: string;
  locale: string;
  proposalTitle: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [payFull, setPayFull] = React.useState(false);
  const [creditOpen, setCreditOpen] = React.useState(false);
  const [emailOpen, setEmailOpen] = React.useState(false);
  const lineItems = invoice.content.lineItems ?? [];
  const balance = Math.max(0, invoice.total - invoice.amountPaid);

  async function shareInvoice() {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/share`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      await navigator.clipboard.writeText(data.url).catch(() => {});
      toast.success('Public link copied to clipboard');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function syncPayment() {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(data.updated ? 'Payment found and applied' : 'No new payment yet');
      if (data.updated) router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function transition(status: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Invoice marked ${status.toLowerCase()}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card p-8 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              {invoice.type.replace('_', ' ').toLowerCase()}
            </div>
            <h1 className="mt-1 text-3xl font-semibold">
              {invoice.number ?? <span className="text-[var(--color-muted)]">— draft</span>}
            </h1>
            {proposalTitle && (
              <div className="mt-1 text-sm text-[var(--color-muted)]">For {proposalTitle}</div>
            )}
          </div>
          <div className="text-right">
            <span className={`chip ${TONE[invoice.status] ?? ''}`}>
              {invoice.status.replace('_', ' ')}
            </span>
            <div className="mt-2 text-xs text-[var(--color-muted)]">
              Issued {formatDate(invoice.issueDate)}
            </div>
            {invoice.dueDate && (
              <div className="text-xs text-[var(--color-muted)]">
                Due {formatDate(invoice.dueDate)}
              </div>
            )}
          </div>
        </div>

        {invoice.irn && (
          <div className="mt-4 chip">
            IRN <code className="ml-1">{invoice.irn.slice(0, 16)}…</code>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {invoice.status === 'DRAFT' && (
            <Button onClick={() => transition('SENT')} loading={busy}>
              <Send className="h-4 w-4" /> Allocate number + send
            </Button>
          )}
          {!['PAID', 'VOID'].includes(invoice.status) && (
            <Button variant="danger" onClick={() => transition('VOID')} loading={busy}>
              <Ban className="h-4 w-4" /> Void
            </Button>
          )}
          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && (
            <>
              <Button variant="secondary" onClick={() => { setPayFull(true); setPaymentOpen(true); }}>
                <CheckCircle2 className="h-4 w-4" /> Mark fully paid
              </Button>
              <Button variant="secondary" onClick={() => { setPayFull(false); setPaymentOpen(true); }}>
                <Plus className="h-4 w-4" /> Record payment
              </Button>
            </>
          )}
          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status) && (
            <Button variant="ghost" onClick={syncPayment} loading={busy}>
              <RefreshCw className="h-4 w-4" /> Sync payment status
            </Button>
          )}
          {['SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID'].includes(invoice.status) && (
            <Button variant="secondary" onClick={() => setCreditOpen(true)}>
              <FileMinus className="h-4 w-4" /> Issue credit note
            </Button>
          )}
          <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
            <Button variant="ghost"><Download className="h-4 w-4" /> Download PDF</Button>
          </a>
          {invoice.status !== 'VOID' && (
            <>
              <Button variant="ghost" onClick={() => setEmailOpen(true)}>
                <Mail className="h-4 w-4" /> Email invoice
              </Button>
              <Button variant="ghost" onClick={shareInvoice} loading={busy}>
                <Link2 className="h-4 w-4" /> Copy share link
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Unit price</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i} className="border-t">
                <td className="px-4 py-3">{li.name}</td>
                <td className="px-4 py-3 text-right">
                  {li.quantity} {li.unit}
                </td>
                <td className="px-4 py-3 text-right">{formatCurrency(li.unitPrice, currency, locale)}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {formatCurrency(li.amount, currency, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mt-6">
        <div className="card p-6">
          <h3 className="font-semibold mb-3">Totals</h3>
          <div className="flex justify-between text-sm py-1">
            <span className="text-[var(--color-muted)]">Subtotal</span>
            <span>{formatCurrency(invoice.subtotal, currency, locale)}</span>
          </div>
          {(invoice.cgst + invoice.sgst) > 0 ? (
            <>
              <div className="flex justify-between text-sm py-1">
                <span className="text-[var(--color-muted)]">CGST</span>
                <span>{formatCurrency(invoice.cgst, currency, locale)}</span>
              </div>
              <div className="flex justify-between text-sm py-1">
                <span className="text-[var(--color-muted)]">SGST</span>
                <span>{formatCurrency(invoice.sgst, currency, locale)}</span>
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm py-1">
              <span className="text-[var(--color-muted)]">IGST</span>
              <span>{formatCurrency(invoice.igst, currency, locale)}</span>
            </div>
          )}
          <div className="mt-3 pt-3 border-t flex justify-between">
            <span className="text-sm uppercase tracking-wider text-[var(--color-muted)]">Total</span>
            <span className="text-2xl font-semibold">{formatCurrency(invoice.total, currency, locale)}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-[var(--color-muted)]">Paid</span>
            <span className="text-emerald-400">{formatCurrency(invoice.amountPaid, currency, locale)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted)]">Balance</span>
            <span>{formatCurrency(invoice.total - invoice.amountPaid, currency, locale)}</span>
          </div>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold mb-3">Payments</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No payments recorded yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between items-center rounded-xl border bg-[var(--color-surface-2)] p-3">
                  <div>
                    <div className="font-medium">{p.method}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {p.status} {p.provider ? `· ${p.provider}` : ''} {p.paidAt ? `· ${formatDate(p.paidAt)}` : ''}
                    </div>
                  </div>
                  <span className="font-medium">{formatCurrency(p.amount, currency, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <RecordPaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoiceId={invoice.id}
        balance={balance}
        currency={currency}
        locale={locale}
        title={payFull ? 'Mark fully paid' : 'Record payment'}
        onDone={() => router.refresh()}
      />
      <CreditNoteModal
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        invoiceId={invoice.id}
        total={invoice.total}
        currency={currency}
        locale={locale}
        onDone={() => router.refresh()}
      />
      <EmailInvoiceModal
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        invoiceId={invoice.id}
        onDone={() => router.refresh()}
      />
    </motion.div>
  );
}

function EmailInvoiceModal({
  open, onClose, invoiceId, onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  onDone: () => void;
}) {
  const [to, setTo] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: to || undefined, message: message || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Invoice emailed to ${data.to}`);
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Email invoice">
      <p className="mb-3 text-sm text-[var(--color-muted)]">
        Sends a View &amp; Pay link. Leave the address blank to use the client&apos;s email on file.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Recipient email" type="email" placeholder="client@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
        <Textarea label="Message (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="flex justify-end gap-2 border-t pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Send</Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({
  open, onClose, invoiceId, balance, currency, locale, title = 'Record payment', onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  balance: number;
  currency: string;
  locale: string;
  title?: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(String(balance));
  const [method, setMethod] = React.useState<'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'NETBANKING' | 'UPI' | 'CARD'>('BANK_TRANSFER');
  const [paidAt, setPaidAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) setAmount(String(balance)); }, [open, balance]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
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
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-[var(--color-muted)] mb-3">
        Outstanding balance: <strong>{formatCurrency(balance, currency, locale)}</strong>
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="BANK_TRANSFER">Bank Transfer</option>
          <option value="NETBANKING">Net Banking</option>
          <option value="UPI">UPI</option>
          <option value="CASH">Cash</option>
          <option value="CHEQUE">Cheque</option>
          <option value="CARD">Card</option>
        </Select>
        <Input label="Paid at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        <Textarea label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!amount || Number(amount) <= 0}>
            Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreditNoteModal({
  open, onClose, invoiceId, total, currency, locale, onDone,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
  total: number;
  currency: string;
  locale: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState(String(total));
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { if (open) setAmount(String(total)); }, [open, total]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/credit-note`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Credit note created');
      onClose();
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Issue credit note">
      <p className="text-sm text-[var(--color-muted)] mb-3">
        Generates a new credit-note invoice referencing this one. Original invoice total: <strong>{formatCurrency(total, currency, locale)}</strong>
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Credit amount" type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} variant="danger">
            Issue credit note
          </Button>
        </div>
      </form>
    </Modal>
  );
}
