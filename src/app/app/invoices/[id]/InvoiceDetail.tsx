'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Receipt, CheckCircle2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
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
  const lineItems = invoice.content.lineItems ?? [];

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
          {invoice.status === 'SENT' && (
            <Button variant="secondary" onClick={() => transition('PAID')} loading={busy}>
              <CheckCircle2 className="h-4 w-4" /> Mark fully paid
            </Button>
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
    </motion.div>
  );
}
