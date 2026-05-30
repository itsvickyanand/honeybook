'use client';
import { motion } from 'framer-motion';
import { ProposalDoc, computeTotals } from '@/lib/proposal-schema';
import { formatCurrency } from '@/lib/utils';

export function PricingSummary({
  doc,
  locale,
  className,
}: {
  doc: ProposalDoc;
  locale: string;
  className?: string;
}) {
  const totals = computeTotals(doc);
  return (
    <motion.div
      layout
      className={`card p-6 ${className ?? ''}`}
    >
      <div className="flex justify-between text-sm">
        <span className="text-[var(--color-muted)]">Subtotal</span>
        <span className="font-medium">{formatCurrency(totals.subtotal, doc.currency, locale)}</span>
      </div>
      {totals.discount > 0 && (
        <div className="flex justify-between text-sm mt-2">
          <span className="text-[var(--color-muted)]">Discount</span>
          <span className="text-emerald-400">- {formatCurrency(totals.discount, doc.currency, locale)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm mt-2">
        <span className="text-[var(--color-muted)]">
          {doc.taxLabel} ({doc.taxRate}%)
        </span>
        <span>{formatCurrency(totals.taxAmount, doc.currency, locale)}</span>
      </div>
      <div className="mt-4 pt-4 border-t flex justify-between items-baseline">
        <span className="text-sm uppercase tracking-wider text-[var(--color-muted)]">Total</span>
        <motion.span
          key={totals.total}
          initial={{ scale: 1.05 }}
          animate={{ scale: 1 }}
          className="text-2xl font-semibold bg-gradient-to-r from-[var(--color-primary-soft)] to-[var(--color-accent)] bg-clip-text text-transparent"
        >
          {formatCurrency(totals.total, doc.currency, locale)}
        </motion.span>
      </div>
    </motion.div>
  );
}
