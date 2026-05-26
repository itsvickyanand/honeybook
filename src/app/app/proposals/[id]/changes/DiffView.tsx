'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, X, ArrowRight, MessageSquareQuote } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ProposalDoc, LineItem, computeTotals } from '@/lib/proposal-schema';
import { formatCurrency } from '@/lib/utils';

/**
 * Side-by-side diff of two ProposalDoc versions, with accept/reject actions.
 * Heuristic match: line items are matched by sourceRowId, then by name.
 */
type Change =
  | { type: 'qty'; sectionId: string; itemId: string; from: number; to: number; itemName: string; unitPrice: number }
  | { type: 'remove'; sectionId: string; itemId: string; itemName: string; quantity: number; unitPrice: number }
  | { type: 'add'; sectionId: string; itemId: string; itemName: string; quantity: number; unitPrice: number };

function findItem(doc: ProposalDoc, sourceRowId?: string, name?: string, id?: string): { sectionId: string; item: LineItem } | null {
  for (const s of doc.sections) {
    for (const i of s.items) {
      if (id && i.id === id) return { sectionId: s.id, item: i };
      if (sourceRowId && i.sourceRowId && i.sourceRowId === sourceRowId) return { sectionId: s.id, item: i };
      if (!sourceRowId && name && i.name === name) return { sectionId: s.id, item: i };
    }
  }
  return null;
}

function computeChanges(before: ProposalDoc, after: ProposalDoc): Change[] {
  const changes: Change[] = [];
  // qty + remove
  for (const sb of before.sections) {
    for (const ib of sb.items) {
      const match = findItem(after, ib.sourceRowId, ib.name);
      if (!match) {
        changes.push({ type: 'remove', sectionId: sb.id, itemId: ib.id, itemName: ib.name, quantity: ib.quantity, unitPrice: ib.unitPrice });
      } else if (match.item.quantity !== ib.quantity) {
        changes.push({ type: 'qty', sectionId: sb.id, itemId: ib.id, from: ib.quantity, to: match.item.quantity, itemName: ib.name, unitPrice: ib.unitPrice });
      }
    }
  }
  // adds
  for (const sa of after.sections) {
    for (const ia of sa.items) {
      const match = findItem(before, ia.sourceRowId, ia.name);
      if (!match) {
        changes.push({ type: 'add', sectionId: sa.id, itemId: ia.id, itemName: ia.name, quantity: ia.quantity, unitPrice: ia.unitPrice });
      }
    }
  }
  return changes;
}

export function DiffView({
  proposalId, before, after, note, currency, locale,
}: {
  proposalId: string;
  before: ProposalDoc;
  after: ProposalDoc;
  note: string | null;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const [working, setWorking] = React.useState(false);
  const changes = React.useMemo(() => computeChanges(before, after), [before, after]);
  const bt = React.useMemo(() => computeTotals({ ...before }), [before]);
  const at = React.useMemo(() => computeTotals({ ...after }), [after]);

  async function acceptClient() {
    setWorking(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: after,
          note: 'Vendor accepted client changes',
          status: 'ACCEPTED',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Client changes accepted');
      router.push(`/app/proposals/${proposalId}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  }

  async function counterOffer() {
    setWorking(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: before, note: 'Vendor counter-offer: original terms' }),
      });
      if (!res.ok) throw new Error('failed');
      toast.success('Counter-offer saved as new version');
      router.push(`/app/proposals/${proposalId}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Client requested changes</h1>
          <p className="mt-1 text-[var(--color-muted)]">Review side-by-side and decide.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={counterOffer} loading={working}>
            <X className="h-4 w-4" /> Counter-offer (restore original)
          </Button>
          <Button onClick={acceptClient} loading={working}>
            <Check className="h-4 w-4" /> Accept client&apos;s version
          </Button>
        </div>
      </div>

      {note && (
        <div className="card p-4 bg-blue-500/10 border-blue-500/40">
          <div className="flex gap-2">
            <MessageSquareQuote className="h-4 w-4 text-blue-300 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-200">{note}</p>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold mb-3">Summary of changes</h2>
        {changes.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No structural changes detected.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {changes.map((c, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl border bg-[var(--color-surface-2)] p-3">
                {c.type === 'qty' && (
                  <>
                    <span className="chip">Quantity</span>
                    <span className="flex-1">{c.itemName}</span>
                    <span className="text-[var(--color-muted)] tabular-nums">
                      {c.from} <ArrowRight className="inline h-3 w-3 mx-1" /> <span className="text-white">{c.to}</span>
                    </span>
                  </>
                )}
                {c.type === 'remove' && (
                  <>
                    <span className="chip bg-red-500/20 text-red-300">Removed</span>
                    <span className="flex-1">{c.itemName}</span>
                    <span className="text-[var(--color-muted)]">−{formatCurrency(c.quantity * c.unitPrice, currency, locale)}</span>
                  </>
                )}
                {c.type === 'add' && (
                  <>
                    <span className="chip bg-emerald-500/20 text-emerald-300">Added</span>
                    <span className="flex-1">{c.itemName}</span>
                    <span className="text-emerald-300">+{formatCurrency(c.quantity * c.unitPrice, currency, locale)}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SideView title="Your last version" doc={before} totals={bt} currency={currency} locale={locale} tint="border-slate-500/30" />
        <SideView title="Client's version" doc={after} totals={at} currency={currency} locale={locale} tint="border-[var(--color-primary)]/40" />
      </div>
    </motion.div>
  );
}

function SideView({
  title, doc, totals, currency, locale, tint,
}: {
  title: string;
  doc: ProposalDoc;
  totals: ReturnType<typeof computeTotals>;
  currency: string;
  locale: string;
  tint: string;
}) {
  return (
    <div className={`card p-5 border ${tint}`}>
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="text-sm space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {doc.sections.map((s) => (
          <div key={s.id}>
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{s.title}</div>
            <ul className="mt-1 space-y-1">
              {s.items.map((it) => (
                <li key={it.id} className="flex justify-between">
                  <span className="truncate flex-1 mr-2">{it.name}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">
                    {it.quantity} × {formatCurrency(it.unitPrice, currency, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t flex justify-between text-sm">
        <span className="text-[var(--color-muted)]">Total</span>
        <span className="font-semibold">{formatCurrency(totals.total, currency, locale)}</span>
      </div>
    </div>
  );
}
