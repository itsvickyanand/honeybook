/**
 * Public invoice page — anyone with the share link can view and pay.
 */
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PayInvoice } from './PayInvoice';

export const dynamic = 'force-dynamic';

interface Content {
  lineItems?: Array<{ name: string; quantity: number; unit?: string; unitPrice: number; amount: number }>;
  notes?: string;
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { shareToken: token },
    include: { tenant: true },
  });
  if (!invoice) notFound();
  const contact = invoice.contactId
    ? await prisma.contact.findUnique({ where: { id: invoice.contactId }, select: { fullName: true } })
    : null;

  const t = invoice.tenant;
  const cur = t.currency;
  const loc = t.locale;
  const content = (invoice.contentJson ?? {}) as Content;
  const lineItems = content.lineItems ?? [];
  const balance = Math.max(0, invoice.total - invoice.amountPaid);
  const hasTax = invoice.cgst + invoice.sgst > 0;

  return (
    <main className="relative min-h-screen overflow-hidden p-6">
      <div className="aurora" />
      <div className="relative z-10 mx-auto max-w-2xl">
        <div className="card p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Invoice</div>
              <h1 className="mt-1 text-2xl font-semibold">{invoice.number ?? 'Draft'}</h1>
              <div className="mt-1 text-sm text-[var(--color-muted)]">from {t.name}</div>
            </div>
            <div className="text-right text-xs text-[var(--color-muted)]">
              <div>Issued {formatDate(invoice.issueDate)}</div>
              {invoice.dueDate && <div>Due {formatDate(invoice.dueDate)}</div>}
              <div className="mt-2 chip">{invoice.status.replace('_', ' ')}</div>
            </div>
          </div>

          {contact && (
            <div className="mt-4 text-sm text-[var(--color-muted)]">Billed to {contact.fullName}</div>
          )}

          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((li, i) => (
                  <tr key={i} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">{li.name}</td>
                    <td className="px-3 py-2 text-right">{li.quantity} {li.unit ?? ''}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(li.unitPrice, cur, loc)}</td>
                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(li.amount, cur, loc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <Row label="Subtotal" value={formatCurrency(invoice.subtotal, cur, loc)} />
            {hasTax ? (
              <>
                <Row label="CGST" value={formatCurrency(invoice.cgst, cur, loc)} muted />
                <Row label="SGST" value={formatCurrency(invoice.sgst, cur, loc)} muted />
              </>
            ) : (
              invoice.igst > 0 && <Row label="IGST" value={formatCurrency(invoice.igst, cur, loc)} muted />
            )}
            <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
              <span className="text-sm uppercase tracking-wider text-[var(--color-muted)]">Total</span>
              <span className="text-2xl font-semibold">{formatCurrency(invoice.total, cur, loc)}</span>
            </div>
            {invoice.amountPaid > 0 && (
              <>
                <Row label="Paid" value={formatCurrency(invoice.amountPaid, cur, loc)} />
                <Row label="Balance" value={formatCurrency(balance, cur, loc)} />
              </>
            )}
          </div>

          <PayInvoice
            token={token}
            status={invoice.status}
            balance={balance}
            currency={cur}
            locale={loc}
          />
        </div>
        <p className="mt-4 text-center text-xs text-[var(--color-muted)]">Secured payments via Razorpay · {t.name}</p>
      </div>
    </main>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-muted)]">{label}</span>
      <span className={muted ? 'text-[var(--color-muted)]' : ''}>{value}</span>
    </div>
  );
}
