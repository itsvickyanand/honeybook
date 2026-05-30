'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Copy, ExternalLink, Save, Plus, Trash2, History, Receipt, AlertTriangle, Info, XCircle, ChevronDown,
  PenSquare, CreditCard, Check, Clock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { ProposalDoc, computeTotals } from '@/lib/proposal-schema';
import { PricingSummary } from '@/components/proposal/PricingSummary';
import { formatCurrency, timeAgo } from '@/lib/utils';

const STATUS_TONE: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  SENT: 'bg-blue-500/20 text-blue-300',
  VIEWED: 'bg-purple-500/20 text-purple-300',
  CHANGES_REQUESTED: 'bg-amber-500/20 text-amber-300',
  ACCEPTED: 'bg-emerald-500/20 text-emerald-300',
};

interface EventLog {
  id: string;
  type: string;
  actor: string;
  payload: unknown;
  createdAt: string;
}

interface AIIssue { severity: string; code: string; message: string; itemId?: string }
interface Signature { id: string; status: string; signedAt: string | null }
interface InvoiceSummary { id: string; number: string | null; status: string; total: number; amountPaid: number }

export function ProposalEditor({
  proposalId,
  shareToken,
  currency,
  locale,
  taxLabel,
  initialDoc,
  initialStatus,
  events,
  aiIssues = [],
  signature: initialSignature = null,
  invoiceSummary = null,
  hasClientEmail = false,
  initialDepositPercent = 0,
}: {
  proposalId: string;
  shareToken: string;
  status: string;
  currency: string;
  locale: string;
  taxLabel: string;
  initialDoc: ProposalDoc;
  initialStatus: string;
  events: EventLog[];
  aiIssues?: AIIssue[];
  signature?: Signature | null;
  invoiceSummary?: InvoiceSummary | null;
  hasClientEmail?: boolean;
  initialDepositPercent?: number;
}) {
  const router = useRouter();
  const [doc, setDoc] = React.useState<ProposalDoc>(initialDoc);
  const [status, setStatus] = React.useState(initialStatus);
  const [saving, setSaving] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [signature, setSignature] = React.useState<Signature | null>(initialSignature);
  const [signing, setSigning] = React.useState(false);
  const [paySending, setPaySending] = React.useState(false);
  const [depositPercent, setDepositPercent] = React.useState(initialDepositPercent);
  const [savingDeposit, setSavingDeposit] = React.useState(false);

  async function saveDeposit(v: number) {
    setSavingDeposit(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ depositPercent: v }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(`Deposit set to ${v}%`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingDeposit(false); }
  }

  async function sendForSignature() {
    setSigning(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/signature`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSignature({ id: data.requestId, status: data.resent ? 'PENDING' : 'SENT', signedAt: null });
      toast.success(data.resent ? 'Signature link re-sent to client' : 'Signature request sent to client');
      if (data.signUrl) {
        try { await navigator.clipboard.writeText(data.signUrl); } catch { /* */ }
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setSigning(false); }
  }

  async function sendPayLink() {
    setPaySending(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/pay-link`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(data.alreadyPaid ? 'Already fully paid' : 'Payment link sent to client');
      if (data.payUrl) {
        try { await navigator.clipboard.writeText(data.payUrl); } catch { /* */ }
      }
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setPaySending(false); }
  }

  async function convertToInvoice() {
    setConverting(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/convert-to-invoice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Invoice created');
      router.push(`/app/invoices/${data.invoice.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  React.useEffect(() => {
    setDirty(JSON.stringify(doc) !== JSON.stringify(initialDoc));
  }, [doc, initialDoc]);

  function update<K extends keyof ProposalDoc>(key: K, value: ProposalDoc[K]) {
    setDoc((d) => ({ ...d, [key]: value }));
  }

  function updateSection(sectionId: string, fn: (s: ProposalDoc['sections'][number]) => ProposalDoc['sections'][number]) {
    setDoc((d) => ({ ...d, sections: d.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));
  }

  function addSection() {
    setDoc((d) => ({
      ...d,
      sections: [...d.sections, { id: nanoid(8), title: 'New section', intro: '', items: [] }],
    }));
  }
  function removeSection(id: string) {
    setDoc((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }));
  }
  function addItem(sectionId: string) {
    updateSection(sectionId, (s) => ({
      ...s,
      items: [
        ...s.items,
        { id: nanoid(8), name: 'New item', description: '', quantity: 1, unit: 'unit', unitPrice: 0, amount: 0, alternates: [] },
      ],
    }));
  }
  function removeItem(sectionId: string, itemId: string) {
    updateSection(sectionId, (s) => ({ ...s, items: s.items.filter((i) => i.id !== itemId) }));
  }
  function updateItem(sectionId: string, itemId: string, patch: Partial<ProposalDoc['sections'][number]['items'][number]>) {
    updateSection(sectionId, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    }));
  }

  async function save(note?: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: doc, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Saved');
      setDirty(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function send() {
    if (dirty) await save('Auto-saved before sending');
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'SENT' }),
    });
    if (!res.ok) return toast.error('Failed');
    setStatus('SENT');
    toast.success('Marked as sent — share the link with your client');
    router.refresh();
  }

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/p/${shareToken}`
    : `/p/${shareToken}`;

  function copyShare() {
    navigator.clipboard.writeText(shareUrl);
    toast.success('Link copied');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* AI issues banner */}
        {aiIssues.length > 0 && <AIIssuesBanner issues={aiIssues} />}

        {/* Header card */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className={`chip ${STATUS_TONE[status] ?? ''}`}>{status.replace('_', ' ')}</span>
            <span className="text-xs text-[var(--color-muted)]">{currency} · {taxLabel} {doc.taxRate}%</span>
          </div>
          <Input
            value={doc.title}
            onChange={(e) => update('title', e.target.value)}
            className="text-2xl font-semibold"
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input
              label="Client name"
              value={doc.clientName ?? ''}
              onChange={(e) => update('clientName', e.target.value)}
            />
            <Input
              label="Vendor"
              value={doc.vendorName ?? ''}
              onChange={(e) => update('vendorName', e.target.value)}
            />
          </div>
          <div className="mt-3">
            <Textarea
              label="Intro"
              value={doc.intro ?? ''}
              onChange={(e) => update('intro', e.target.value)}
            />
          </div>
        </div>

        {/* Sections */}
        <AnimatePresence>
          {doc.sections.map((s) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="card p-6"
            >
              <div className="flex items-start gap-3 mb-4">
                <Input
                  value={s.title}
                  onChange={(e) => updateSection(s.id, (x) => ({ ...x, title: e.target.value }))}
                  className="text-lg font-semibold"
                />
                <button
                  onClick={() => removeSection(s.id)}
                  className="btn-ghost p-2 text-red-400 mt-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                placeholder="Section intro"
                value={s.intro ?? ''}
                onChange={(e) => updateSection(s.id, (x) => ({ ...x, intro: e.target.value }))}
                className="mb-4 min-h-[60px]"
              />
              <div className="space-y-2">
                <AnimatePresence>
                  {s.items.map((it) => (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -4 }}
                      className="rounded-xl border bg-[var(--color-surface-2)] p-3"
                    >
                      <div className="grid gap-2 md:grid-cols-12 items-start">
                        <div className="md:col-span-5">
                          <Input
                            placeholder="Item name"
                            value={it.name}
                            onChange={(e) => updateItem(s.id, it.id, { name: e.target.value })}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Input
                            type="number"
                            placeholder="Qty"
                            value={it.quantity}
                            onChange={(e) => updateItem(s.id, it.id, { quantity: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Input
                            placeholder="Unit"
                            value={it.unit ?? 'unit'}
                            onChange={(e) => updateItem(s.id, it.id, { unit: e.target.value })}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Input
                            type="number"
                            placeholder="Unit price"
                            value={it.unitPrice}
                            onChange={(e) => updateItem(s.id, it.id, { unitPrice: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <button
                            className="btn-ghost p-2 text-red-400 mt-1"
                            onClick={() => removeItem(s.id, it.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <Input
                        placeholder="Description (optional)"
                        value={it.description ?? ''}
                        onChange={(e) => updateItem(s.id, it.id, { description: e.target.value })}
                        className="mt-2"
                      />
                      <div className="mt-2 text-right text-xs text-[var(--color-muted)]">
                        Subtotal:{' '}
                        <span className="text-white font-medium">
                          {formatCurrency((it.quantity || 0) * (it.unitPrice || 0), currency, locale)}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                <Button variant="ghost" onClick={() => addItem(s.id)} className="w-full justify-center">
                  <Plus className="h-4 w-4" /> Add line item
                </Button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <Button variant="secondary" onClick={addSection}>
          <Plus className="h-4 w-4" /> Add section
        </Button>

        {/* Inclusions & terms */}
        <div className="grid gap-6 md:grid-cols-2">
          <ListEditor
            title="Inclusions"
            items={doc.inclusions ?? []}
            onChange={(v) => update('inclusions', v)}
          />
          <ListEditor
            title="Terms & Conditions"
            items={doc.terms ?? []}
            onChange={(v) => update('terms', v)}
          />
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-4 lg:sticky lg:top-6 self-start">
        <div className="flex flex-col gap-2">
          <Button onClick={() => save()} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" /> {dirty ? 'Save changes' : 'Saved'}
          </Button>
          {status === 'DRAFT' ? (
            <Button variant="secondary" onClick={send}>
              <Send className="h-4 w-4" /> Send to client
            </Button>
          ) : (
            <Button variant="secondary" onClick={copyShare}>
              <Copy className="h-4 w-4" /> Copy share link
            </Button>
          )}
          <Link href={`/p/${shareToken}`} target="_blank" className="btn-ghost text-center">
            <ExternalLink className="h-4 w-4" /> Preview as client
          </Link>
          {(status === 'ACCEPTED' || status === 'SENT' || status === 'VIEWED' || status === 'CHANGES_REQUESTED') && (
            <Button variant="secondary" onClick={convertToInvoice} loading={converting}>
              <Receipt className="h-4 w-4" /> Convert to invoice
            </Button>
          )}
          {status === 'CHANGES_REQUESTED' && (
            <Link href={`/app/proposals/${proposalId}/changes`} className="btn-secondary">
              Review client changes
            </Link>
          )}
          <Button
            variant="secondary"
            onClick={sendPayLink}
            loading={paySending}
            disabled={!hasClientEmail || invoiceSummary?.status === 'PAID'}
            title={!hasClientEmail ? 'Add a client email first' : invoiceSummary?.status === 'PAID' ? 'Already paid' : 'Email a Razorpay link to the client'}
          >
            <CreditCard className="h-4 w-4" /> Send pay link
          </Button>
          <Button
            variant="secondary"
            onClick={sendForSignature}
            loading={signing}
            disabled={!hasClientEmail || signature?.status === 'SIGNED'}
            title={!hasClientEmail ? 'Add a client email first' : signature?.status === 'SIGNED' ? 'Already signed' : signature ? 'Resend signature request' : 'Send for signature'}
          >
            <PenSquare className="h-4 w-4" /> {signature?.status === 'SIGNED' ? 'Signed' : signature ? 'Resend for signature' : 'Send for signature'}
          </Button>
        </div>

        {/* Pay + Sign status pills */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Pay &amp; Sign</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-[var(--color-muted)]" /> Invoice</span>
              {!invoiceSummary ? (
                <span className="chip">Not created</span>
              ) : invoiceSummary.status === 'PAID' ? (
                <span className="chip bg-emerald-500/20 text-emerald-300"><Check className="h-3 w-3" /> Paid · {invoiceSummary.number}</span>
              ) : (
                <span className="chip bg-amber-500/20 text-amber-300"><Clock className="h-3 w-3" /> {invoiceSummary.status.replace('_', ' ').toLowerCase()}</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2"><PenSquare className="h-4 w-4 text-[var(--color-muted)]" /> Signature</span>
              {!signature ? (
                <span className="chip">Not sent</span>
              ) : signature.status === 'SIGNED' ? (
                <span className="chip bg-emerald-500/20 text-emerald-300"><Check className="h-3 w-3" /> Signed</span>
              ) : (
                <span className="chip bg-amber-500/20 text-amber-300"><Clock className="h-3 w-3" /> {signature.status.toLowerCase()}</span>
              )}
            </div>
            <div className="flex items-center justify-between border-t pt-3 mt-1">
              <span className="text-xs text-[var(--color-muted)]">Deposit % (asked before accept)</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(Number(e.target.value) || 0)}
                  onBlur={() => depositPercent !== initialDepositPercent && saveDeposit(depositPercent)}
                  className="w-16 h-8 px-2 text-center"
                />
                <span className="text-sm text-[var(--color-muted)]">%</span>
                {savingDeposit && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
            </div>
          </div>
        </div>

        <PricingSummary doc={doc} locale={locale} />

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-[var(--color-muted)]" />
            <h3 className="font-semibold text-sm">Activity</h3>
          </div>
          {events.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">
              Nothing yet. Send the proposal to see views and change requests.
            </p>
          ) : (
            <ul className="space-y-3 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-[var(--color-primary-soft)]" />
                  <div className="min-w-0">
                    <div className="text-[var(--color-text)]">
                      {prettyEvent(e.type, e.actor)}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">{timeAgo(e.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function prettyEvent(type: string, actor: string) {
  const who = actor === 'client' ? 'Client' : 'Vendor';
  switch (type) {
    case 'VIEWED': return `${who} viewed the proposal`;
    case 'EDITED': return `${who} edited line items`;
    case 'CHANGE_REQUESTED': return `${who} requested changes`;
    case 'COMMENTED': return `${who} left a comment`;
    case 'ACCEPTED': return `${who} accepted the proposal`;
    case 'DECLINED': return `${who} declined the proposal`;
    default: return `${who} · ${type}`;
  }
}

function ListEditor({ title, items, onChange }: {
  title: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  function update(idx: number, value: string) {
    onChange(items.map((it, i) => (i === idx ? value : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  return (
    <div className="card p-5">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input value={it} onChange={(e) => update(idx, e.target.value)} />
            <button onClick={() => remove(idx)} className="btn-ghost p-2 text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => onChange([...items, ''])} className="w-full justify-center">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </div>
  );
}

function AIIssuesBanner({ issues }: { issues: AIIssue[] }) {
  const [open, setOpen] = React.useState(true);
  const errors = issues.filter((i) => i.severity === 'ERROR');
  const warns = issues.filter((i) => i.severity === 'WARN');
  const tone = errors.length
    ? 'border-red-500/40 bg-red-500/10 text-red-200'
    : 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  const Icon = errors.length ? XCircle : AlertTriangle;
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`card p-4 border ${tone}`}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 text-left">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">
          {errors.length > 0
            ? `${errors.length} ${errors.length === 1 ? 'issue' : 'issues'} found`
            : `${warns.length} ${warns.length === 1 ? 'warning' : 'warnings'}`}
          {warns.length > 0 && errors.length > 0 && ` · ${warns.length} warning${warns.length === 1 ? '' : 's'}`}
        </span>
        <span className="text-xs opacity-70 ml-auto">AI review</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {issues.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              {it.severity === 'ERROR' ? <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
              <span><span className="opacity-70">[{it.code}]</span> {it.message}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
