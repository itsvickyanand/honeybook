'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Pencil, Check, X, Plus, Minus, MessageSquare, ThumbsUp, ThumbsDown, Send, ShieldCheck,
  CreditCard, PenSquare, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ProposalDoc, computeTotals } from '@/lib/proposal-schema';
import { formatCurrency } from '@/lib/utils';
import type { Block } from '@/lib/proposals/blocks';
import { renderBlock } from '@/lib/proposals/blocks-render';
import { sampleVars } from '@/lib/proposals/blocks-client';

interface ClientPortalProps {
  token: string;
  initialDoc: ProposalDoc;
  status: string;
  depositPercent?: number;
  currency: string;
  locale: string;
  taxLabel: string;
  vendor: { name: string; brandColor: string; businessType: string; accentColor: string };
  template?: { theme: { primary: string; accent: string }; sections: { id: string; kind: string; visible: boolean; title?: string }[] };
  galleries?: { id: string; title: string; items: { id: string; fileId: string; approved: boolean | null }[] }[];
  documents?: { id: string; title: string; category: string; status: string; isTemplate: boolean }[];
  /** New: block-builder output from the chosen ProposalTemplate. When non-null
   *  the portal renders blocks in order instead of the legacy fixed layout. */
  templateBlocks?: Block[] | null;
  /** Pre-resolved context for the block renderer. Server-built so we don't
   *  re-fetch / re-format on every keystroke. */
  blockRenderData?: {
    accentColor: string;
    vendorLogoUrl: string | null;
    totals: { subTotal: string; discount: string; tax: string; total: string; taxLabel: string; taxRate: number };
    galleries: { id: string; title: string; thumbnailUrls: string[] }[];
    paymentSchedule: { label: string; dueDate: string | null; amount: string }[];
    defaultDepositPercent: number | null;
    appUrl: string;
  };
}

export function ClientPortal({
  token,
  initialDoc,
  status: initialStatus,
  depositPercent = 0,
  currency,
  locale,
  taxLabel,
  vendor,
  template,
  galleries = [],
  documents = [],
  templateBlocks = null,
  blockRenderData,
}: ClientPortalProps) {
  const [doc, setDoc] = React.useState<ProposalDoc>(initialDoc);
  const [status, setStatus] = React.useState(initialStatus);
  const [editMode, setEditMode] = React.useState(false);
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [signing, setSigning] = React.useState(false);
  const [invoice, setInvoice] = React.useState<{
    id: string; status: string; number: string | null; total: number; amountPaid: number;
  } | null>(null);
  const [signature, setSignature] = React.useState<{ id: string; status: string } | null>(null);
  const [flash, setFlash] = React.useState<'paid' | 'signed' | null>(null);
  // Embedded DocuSign iframe state
  const [embedUrl, setEmbedUrl] = React.useState<string | null>(null);
  const [embedProvider, setEmbedProvider] = React.useState<'digio' | 'docusign' | null>(null);
  const embedIframeRef = React.useRef<HTMLIFrameElement | null>(null);

  const totals = React.useMemo(() => computeTotals(doc), [doc]);

  // After Razorpay/Digio redirect back: ?paid=1 or ?signed=1 — poll status until reflected.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const justPaid = sp.get('paid') === '1';
    const justSigned = sp.get('signed') === '1';
    if (!justPaid && !justSigned) return;
    setFlash(justPaid ? 'paid' : 'signed');
    // When we land back here from a signing redirect, kick the server-side
    // finalize once so the signed PDF gets pulled + filed as a Document. The
    // webhook is a safety net; this makes the file appear immediately even
    // when DocuSign Connect isn't configured.
    if (justSigned) {
      fetch(`/api/share/${token}/sign/finalize`, { method: 'POST' }).catch(() => { /* webhook handles it */ });
    }
    let cancelled = false;
    let attempts = 0;
    async function poll() {
      if (cancelled || attempts++ > 20) return;
      try {
        const res = await fetch(`/api/share/${token}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.proposal?.status) setStatus(data.proposal.status);
          if (data.invoice) setInvoice(data.invoice);
          if (data.signature) setSignature(data.signature);
          const settled =
            (justPaid && data.invoice?.status === 'PAID') ||
            (justSigned && data.signature?.status === 'SIGNED');
          if (settled) {
            toast.success(justPaid ? 'Payment received' : 'Signature recorded');
            // Clean the URL so refresh doesn't re-fire
            const url = new URL(window.location.href);
            url.searchParams.delete('paid');
            url.searchParams.delete('signed');
            window.history.replaceState({}, '', url.toString());
            return;
          }
        }
      } catch {/* ignore */}
      setTimeout(poll, 800);
    }
    poll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Initial status hydration + re-poll on tab focus / visibility change.
  // This catches up stale tabs the moment the user comes back.
  React.useEffect(() => {
    async function refresh() {
      try {
        const r = await fetch(`/api/share/${token}/status`);
        if (!r.ok) return;
        const d = await r.json();
        if (d?.proposal?.status) setStatus(d.proposal.status);
        if (d?.invoice) setInvoice(d.invoice);
        if (d?.signature) setSignature(d.signature);
      } catch { /* ignore */ }
    }
    refresh();
    function onVis() { if (document.visibilityState === 'visible') refresh(); }
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', refresh);
    };
  }, [token]);

  async function pay(mode: 'full' | 'deposit' = 'full') {
    setPaying(true);
    try {
      const res = await fetch(`/api/share/${token}/pay?mode=${mode}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Failed');
      if (data.alreadyPaid) {
        toast.success('This invoice has already been paid.');
        const s = await fetch(`/api/share/${token}/status`);
        if (s.ok) {
          const sd = await s.json();
          if (sd.invoice) setInvoice(sd.invoice);
          if (sd.signature) setSignature(sd.signature);
        }
        setPaying(false);
        return;
      }
      window.location.href = data.payUrl;
    } catch (e) {
      toast.error((e as Error).message);
      setPaying(false);
    }
  }

  async function sign(provider: 'digio' | 'docusign' = 'digio') {
    setSigning(true);
    try {
      const res = await fetch(`/api/share/${token}/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      // DocuSign embedded signing → open the URL in an iframe modal so the
      // client never leaves this proposal page. Other providers (digio/mock)
      // still redirect away.
      if (provider === 'docusign' && data.signUrl && !data.mock) {
        setEmbedProvider('docusign');
        setEmbedUrl(data.signUrl);
        setSigning(false);
        return;
      }
      window.location.href = data.signUrl;
    } catch (e) {
      toast.error((e as Error).message);
      setSigning(false);
    }
  }

  /**
   * When the DocuSign iframe completes signing, DocuSign redirects to the
   * `returnUrl` we passed when minting the recipient view. That URL is on our
   * own origin (`/p/${token}?signed=1`) so we can read the iframe's location
   * cross-frame (same-origin) and pick up `event=signing_complete`.
   */
  function onEmbedLoad() {
    const iframe = embedIframeRef.current;
    if (!iframe) return;
    try {
      const url = iframe.contentWindow?.location.href ?? '';
      if (!url || !url.includes(window.location.origin)) return; // still on docusign.net
      const sp = new URL(url).searchParams;
      const event = sp.get('event');
      if (event && ['signing_complete', 'cancel', 'decline', 'ttl_expired'].includes(event)) {
        setEmbedUrl(null);
        setEmbedProvider(null);
        if (event === 'signing_complete') {
          toast.success('Document signed — saving to your files…');
          // 1. Server-side finalize: pull the signed PDF directly from
          //    DocuSign and file it as a CONTRACT Document on the project.
          //    Idempotent — safe to call even if the webhook already ran.
          fetch(`/api/share/${token}/sign/finalize`, { method: 'POST' })
            .then((r) => r.json())
            .then((d) => {
              if (d?.documentId) {
                // Auto-download the signed PDF for the client right away.
                downloadDocument(d.documentId).catch(() => { /* toast handled inside */ });
              }
              // If pdfPending, the webhook (or next portal visit) will finalize.
            })
            .catch(() => { /* webhook is the safety net */ });
          // 2. Trigger the existing post-sign poll loop so the signed badge
          //    flips as soon as the SignatureRequest row is updated.
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.set('signed', '1');
          window.history.replaceState({}, '', cleanUrl.toString());
          window.dispatchEvent(new Event('focus'));
        } else {
          toast(event === 'cancel' ? 'Signing cancelled' : `Signing ${event.replace('_', ' ')}`);
        }
      }
    } catch {
      // Cross-origin while still on docusign.net — expected, ignore.
    }
  }

  function closeEmbed() {
    setEmbedUrl(null);
    setEmbedProvider(null);
  }

  /**
   * Resolve a document's short-lived presigned URL and trigger a browser
   * download. Used by both the per-row Download button and the auto-download
   * after DocuSign signing completes.
   */
  async function downloadDocument(documentId: string) {
    try {
      const res = await fetch(`/api/share/${token}/documents/${documentId}`);
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Could not get download link.');
      // Use an anchor with `download` so the browser doesn't navigate away.
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.filename ?? 'document.pdf';
      a.rel = 'noopener';
      // Most modern browsers honor `download` cross-origin only when the URL is
      // same-origin — R2 returns the file as an attachment via the response
      // headers we set, so a new-tab open is the safest fallback.
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function adjustQty(sectionId: string, itemId: string, delta: number) {
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              items: s.items.map((i) =>
                i.id !== itemId ? i : { ...i, quantity: Math.max(0, (i.quantity || 0) + delta) }
              ),
            }
      ),
    }));
  }
  function setQty(sectionId: string, itemId: string, qty: number) {
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id !== sectionId
          ? s
          : {
              ...s,
              items: s.items.map((i) => (i.id !== itemId ? i : { ...i, quantity: Math.max(0, qty) })),
            }
      ),
    }));
  }
  function removeItem(sectionId: string, itemId: string) {
    setDoc((d) => ({
      ...d,
      sections: d.sections.map((s) =>
        s.id !== sectionId ? s : { ...s, items: s.items.filter((i) => i.id !== itemId) }
      ),
    }));
  }

  async function submitChanges() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/share/${token}/changes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: doc, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setStatus('CHANGES_REQUESTED');
      setRequestOpen(false);
      setEditMode(false);
      toast.success('Your changes have been sent to the team');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(decision: 'ACCEPT' | 'DECLINE') {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/share/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setStatus(decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED');
      setAcceptOpen(false);
      setDeclineOpen(false);
      toast.success(decision === 'ACCEPT' ? 'Proposal accepted 🎉' : 'Response sent');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const closed = status === 'ACCEPTED' || status === 'DECLINED';
  const accent = vendor.accentColor;

  return (
    <main className="min-h-screen relative overflow-hidden">
      <div
        className="absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-20"
        style={{ background: accent }}
      />
      <div
        className="absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full blur-3xl opacity-20"
        style={{ background: '#8b5cf6' }}
      />

      {/* Header */}
      <header className="relative z-10 mx-auto max-w-4xl px-6 pt-10">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: accent }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm text-[var(--color-muted)]">Proposal from</div>
              <div className="font-semibold">{vendor.name}</div>
            </div>
          </div>
          <StatusBadge status={status} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-12 text-center"
        >
          <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-balance">
            {doc.title}
          </h1>
          {doc.clientName && (
            <p className="mt-3 text-lg text-[var(--color-muted)]">Prepared for {doc.clientName}</p>
          )}
        </motion.div>

        {doc.intro && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-8 text-center max-w-2xl mx-auto text-[var(--color-muted)] leading-relaxed"
          >
            {doc.intro}
          </motion.p>
        )}

        {/* Edit mode toggle */}
        {!closed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            {!editMode ? (
              <Button
                variant="secondary"
                onClick={() => setEditMode(true)}
              >
                <Pencil className="h-4 w-4" /> Request changes
              </Button>
            ) : (
              <>
                <span className="chip border-[var(--color-primary)]/60 text-white">
                  Edit mode · click + / − or remove items
                </span>
                <Button variant="ghost" onClick={() => { setDoc(initialDoc); setEditMode(false); }}>
                  <X className="h-4 w-4" /> Discard
                </Button>
                <Button onClick={() => setRequestOpen(true)}>
                  <Send className="h-4 w-4" /> Send changes
                </Button>
              </>
            )}
          </motion.div>
        )}
      </header>

      {/* New: template blocks (Phase 3). When the vendor designed the template
       *  in the visual builder, render those blocks in their order. The bottom
       *  Accept/Decline/Pay/Sign CTA always renders regardless — it's about
       *  proposal state, not template shape. */}
      {templateBlocks && templateBlocks.length > 0 && blockRenderData && (
        <section className="relative z-10 mx-auto max-w-4xl px-6 mt-16 space-y-2">
          {templateBlocks.map((b) => {
            const html = renderBlock(b, {
              doc,
              vars: { ...sampleVars(vendor.name), clientName: doc.clientName || sampleVars(vendor.name).clientName },
              accentColor: blockRenderData.accentColor,
              vendorLogoUrl: blockRenderData.vendorLogoUrl,
              totals: blockRenderData.totals,
              galleries: blockRenderData.galleries,
              paymentSchedule: blockRenderData.paymentSchedule,
              defaultDepositPercent: blockRenderData.defaultDepositPercent,
              appUrl: blockRenderData.appUrl,
              formatShortDate: (d) => new Date(d).toLocaleDateString(locale),
            });
            return (
              <div
                key={b.id}
                className="block-render"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
        </section>
      )}

      {/* Legacy layout (sections + pricing + plugin sections + inclusions/terms).
       *  Renders ONLY when the template doesn't have block-builder output. */}
      {(!templateBlocks || templateBlocks.length === 0) && (
        <>
      {/* Sections */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 mt-16 space-y-8">
        {doc.sections.map((s, idx) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.45, delay: idx * 0.05 }}
          >
            <div className="card p-6 md:p-8 backdrop-blur-xl">
              <div className="mb-1 text-xs uppercase tracking-widest text-[var(--color-muted)]">
                Section {idx + 1}
              </div>
              <h2 className="text-2xl font-semibold">{s.title}</h2>
              {s.intro && <p className="mt-2 text-[var(--color-muted)]">{s.intro}</p>}

              <div className="mt-6 space-y-3">
                <AnimatePresence>
                  {s.items.map((it) => (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className="flex items-center gap-4 rounded-xl border bg-[var(--color-surface-2)]/50 backdrop-blur p-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{it.name}</div>
                        {it.description && (
                          <div className="mt-0.5 text-sm text-[var(--color-muted)]">
                            {it.description}
                          </div>
                        )}
                        <div className="mt-1 text-xs text-[var(--color-muted)]">
                          {formatCurrency(it.unitPrice, currency, locale)} / {it.unit}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {editMode ? (
                          <div className="flex items-center gap-2">
                            <button
                              className="btn-ghost h-8 w-8 p-0 rounded-full border"
                              onClick={() => adjustQty(s.id, it.id, -1)}
                              aria-label="decrease"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <input
                              type="number"
                              value={it.quantity}
                              onChange={(e) => setQty(s.id, it.id, Number(e.target.value) || 0)}
                              className="input-base h-9 w-16 text-center px-2 py-1"
                            />
                            <button
                              className="btn-ghost h-8 w-8 p-0 rounded-full border"
                              onClick={() => adjustQty(s.id, it.id, 1)}
                              aria-label="increase"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeItem(s.id, it.id)}
                              className="btn-ghost p-2 text-red-400 ml-1"
                              aria-label="remove"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-[var(--color-muted)]">
                            × {it.quantity} {it.unit}
                          </span>
                        )}
                      </div>

                      <div className="w-28 text-right font-semibold tabular-nums shrink-0">
                        {formatCurrency((it.quantity || 0) * (it.unitPrice || 0), currency, locale)}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Section subtotal</span>
                <span className="font-medium">
                  {formatCurrency(
                    s.items.reduce((t, i) => t + (i.quantity || 0) * (i.unitPrice || 0), 0),
                    currency,
                    locale
                  )}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </section>

      {/* Pricing summary */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 mt-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="card p-8 backdrop-blur-xl"
          style={{ borderColor: accent + '44' }}
        >
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-muted)]">Subtotal</span>
            <span>{formatCurrency(totals.subtotal, currency, locale)}</span>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-sm mt-2">
              <span className="text-[var(--color-muted)]">Discount</span>
              <span className="text-emerald-400">- {formatCurrency(totals.discount, currency, locale)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm mt-2">
            <span className="text-[var(--color-muted)]">
              {taxLabel} ({doc.taxRate}%)
            </span>
            <span>{formatCurrency(totals.taxAmount, currency, locale)}</span>
          </div>
          <div className="mt-6 pt-6 border-t flex items-baseline justify-between">
            <span className="text-sm uppercase tracking-wider text-[var(--color-muted)]">Total</span>
            <motion.span
              key={totals.total}
              initial={{ scale: 1.06 }}
              animate={{ scale: 1 }}
              className="text-4xl font-semibold bg-gradient-to-r from-white to-[var(--color-muted)] bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(90deg, ${accent}, #fff)` }}
            >
              {formatCurrency(totals.total, currency, locale)}
            </motion.span>
          </div>
        </motion.div>
      </section>

      {/* Plugin-injected sections (visa / gallery / documents) */}
      {template?.sections.filter((s) => s.visible).map((s) => {
        if (s.kind === 'gallery' && galleries.length > 0) {
          return (
            <section key={s.id} className="relative z-10 mx-auto max-w-4xl px-6 mt-12">
              <h2 className="text-2xl font-semibold mb-4">{s.title ?? 'Gallery'}</h2>
              {galleries.map((g) => (
                <div key={g.id} className="card p-6 mb-4">
                  <h3 className="font-semibold mb-3">{g.title}</h3>
                  {g.items.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted)]">No items yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {g.items.map((it) => (
                        <div key={it.id} className="aspect-square rounded-xl border bg-[var(--color-surface-2)] flex items-center justify-center text-xs text-[var(--color-muted)]">
                          {it.fileId.slice(-6)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          );
        }
        if (s.kind === 'visa' && documents.some((d) => d.category === 'VISA')) {
          return (
            <section key={s.id} className="relative z-10 mx-auto max-w-4xl px-6 mt-12">
              <div className="card p-6">
                <h2 className="text-2xl font-semibold">{s.title ?? 'Visa Documents'}</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">Please upload each of the following.</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {documents.filter((d) => d.category === 'VISA').map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded-xl border bg-[var(--color-surface-2)] p-3">
                      <span>{d.title}</span>
                      <span className="chip text-xs">{d.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        }
        if (s.kind === 'documents' && documents.length > 0) {
          return (
            <section key={s.id} className="relative z-10 mx-auto max-w-4xl px-6 mt-12">
              <div className="card p-6">
                <h2 className="text-2xl font-semibold">{s.title ?? 'Documents'}</h2>
                <ul className="mt-4 space-y-2 text-sm">
                  {documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border bg-[var(--color-surface-2)] p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{d.title}</div>
                      </div>
                      <span className="chip text-xs shrink-0">{d.category}</span>
                      <button
                        type="button"
                        onClick={() => downloadDocument(d.id)}
                        className="btn-ghost shrink-0 text-xs"
                        aria-label={`Download ${d.title}`}
                      >
                        <Download className="h-4 w-4" /> Download
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        }
        return null;
      })}

      {/* Inclusions + terms */}
      {(doc.inclusions?.length || doc.terms?.length) && (
        <section className="relative z-10 mx-auto max-w-4xl px-6 mt-12 grid gap-6 md:grid-cols-2">
          {doc.inclusions && doc.inclusions.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> What&apos;s included
              </h3>
              <ul className="space-y-2 text-sm">
                {doc.inclusions.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.terms && doc.terms.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold mb-3">Terms</h3>
              <ul className="space-y-2 text-sm text-[var(--color-muted)]">
                {doc.terms.map((it, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-[var(--color-muted)]">•</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
        </>
      )}

      {/* Accept / Decline CTA */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 mt-12 pb-20 text-center">
        {closed ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card p-10"
          >
            {status === 'ACCEPTED' ? (
              <>
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold">You&apos;ve accepted this proposal</h3>
                <p className="mt-2 text-[var(--color-muted)]">
                  Lock it in by paying the advance and signing the agreement.
                </p>

                {/* Status pills for paid/signed */}
                {(invoice || signature) && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    {invoice && (
                      <span className={`chip ${
                        invoice.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-300' :
                        invoice.status === 'PARTIALLY_PAID' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-slate-500/20 text-slate-300'
                      }`}>
                        <CreditCard className="h-3 w-3" />
                        Invoice {invoice.number ?? '—'} · {invoice.status.replace('_',' ').toLowerCase()}
                      </span>
                    )}
                    {signature && (
                      <span className={`chip ${
                        signature.status === 'SIGNED' ? 'bg-emerald-500/20 text-emerald-300' :
                        'bg-slate-500/20 text-slate-300'
                      }`}>
                        <PenSquare className="h-3 w-3" />
                        Agreement · {signature.status.toLowerCase()}
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  {(() => {
                    const due = invoice ? Math.max(0, invoice.total - invoice.amountPaid) : totals.total;
                    if (invoice?.status === 'PAID' || due <= 0) return null;
                    return (
                      <Button onClick={() => pay('full')} loading={paying}>
                        <CreditCard className="h-4 w-4" /> Pay {formatCurrency(due, currency, locale)}
                      </Button>
                    );
                  })()}
                  {(() => {
                    const isSigned = signature?.status === 'SIGNED';
                    return (
                      <>
                        <Button
                          variant={invoice?.status === 'PAID' && !isSigned ? 'primary' : 'secondary'}
                          onClick={() => sign('digio')}
                          loading={signing && !isSigned}
                          disabled={isSigned || signing}
                          title={isSigned ? 'Agreement already signed' : 'Sign with Aadhaar OTP'}
                        >
                          {isSigned ? <Check className="h-4 w-4 text-emerald-400" /> : <PenSquare className="h-4 w-4" />}
                          {isSigned ? 'Signed' : 'Sign with Aadhaar'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => sign('docusign')}
                          loading={signing && !isSigned}
                          disabled={isSigned || signing}
                          title={isSigned ? 'Agreement already signed' : 'Sign with DocuSign'}
                        >
                          {isSigned ? <Check className="h-4 w-4 text-emerald-400" /> : <PenSquare className="h-4 w-4" />}
                          {isSigned ? 'Signed' : 'Sign with DocuSign'}
                        </Button>
                        {isSigned && (
                          <a
                            href={`/api/share/${token}/contract`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary text-sm"
                          >
                            <Download className="h-4 w-4" /> Download signed agreement
                          </a>
                        )}
                      </>
                    );
                  })()}
                  {invoice?.status === 'PAID' && signature?.status === 'SIGNED' && (
                    <div className="text-sm text-emerald-300 inline-flex items-center gap-2">
                      <Check className="h-4 w-4" /> All set — the team will reach out shortly.
                    </div>
                  )}
                </div>

                <AnimatePresence>
                  {flash && (
                    <motion.div
                      key={flash}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="mt-4 chip border-emerald-500/40 text-emerald-300"
                    >
                      <Check className="h-3 w-3" />
                      {flash === 'paid' ? 'Payment confirmed' : 'Signature confirmed'}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              <>
                <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                  <X className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-2xl font-semibold">Proposal declined</h3>
              </>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card p-8"
          >
            <h3 className="text-xl font-semibold">Ready to move forward?</h3>
            <p className="mt-1 text-[var(--color-muted)]">
              {depositPercent > 0
                ? `Lock in your booking by paying ${depositPercent}% deposit. The balance is due closer to your event.`
                : 'Accept to lock in this proposal, or send us a message if anything needs tweaking.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {depositPercent > 0 && (
                <Button onClick={() => pay('deposit')} loading={paying}>
                  <CreditCard className="h-4 w-4" />
                  Pay {formatCurrency(Math.round((totals.total * depositPercent) / 100), currency, locale)} deposit ({depositPercent}%)
                </Button>
              )}
              <Button
                variant={depositPercent > 0 ? 'secondary' : 'primary'}
                onClick={() => setAcceptOpen(true)}
              >
                <ThumbsUp className="h-4 w-4" />
                {depositPercent > 0 ? 'Accept without deposit' : 'Accept proposal'}
              </Button>
              <Button variant="secondary" onClick={() => setEditMode(true)}>
                <MessageSquare className="h-4 w-4" /> Request changes
              </Button>
              <Button variant="ghost" onClick={() => setDeclineOpen(true)}>
                <ThumbsDown className="h-4 w-4" /> Decline
              </Button>
            </div>
          </motion.div>
        )}
      </section>

      <footer className="relative z-10 border-t py-6 text-center text-xs text-[var(--color-muted)]">
        Proposal valid for {doc.validityDays ?? 14} days · powered by Avantus
      </footer>

      {/* MODALS */}
      <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Send your changes">
        <p className="text-sm text-[var(--color-muted)] mb-3">
          Add an optional note to explain what you&apos;d like adjusted.
        </p>
        <Textarea
          placeholder="e.g. Can we add a vegan starter section?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRequestOpen(false)}>Cancel</Button>
          <Button onClick={submitChanges} loading={submitting}>
            <Send className="h-4 w-4" /> Send
          </Button>
        </div>
      </Modal>

      <Modal open={acceptOpen} onClose={() => setAcceptOpen(false)} title="Accept this proposal">
        <p className="text-sm text-[var(--color-muted)]">
          Total: <span className="text-white font-semibold">{formatCurrency(totals.total, currency, locale)}</span>
        </p>
        <Textarea
          label="Optional note"
          placeholder="Anything you'd like to add?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-4"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAcceptOpen(false)}>Cancel</Button>
          <Button onClick={() => decide('ACCEPT')} loading={submitting}>
            <Check className="h-4 w-4" /> Confirm acceptance
          </Button>
        </div>
      </Modal>

      <Modal open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline this proposal">
        <p className="text-sm text-[var(--color-muted)]">
          Let the team know why if you can — it helps them respond.
        </p>
        <Textarea
          placeholder="Optional reason…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeclineOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => decide('DECLINE')} loading={submitting}>
            Decline
          </Button>
        </div>
      </Modal>

      {/* Embedded DocuSign signing — full-screen iframe overlay */}
      {embedUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-white/10 bg-[var(--color-surface)] px-4 py-2">
            <div className="text-sm font-medium">
              Signing your agreement · {embedProvider === 'docusign' ? 'DocuSign' : embedProvider}
            </div>
            <button
              onClick={closeEmbed}
              className="text-xs text-[var(--color-muted)] hover:text-white"
              aria-label="Close signing window"
            >
              Cancel
            </button>
          </div>
          <iframe
            ref={embedIframeRef}
            src={embedUrl}
            onLoad={onEmbedLoad}
            title="Sign agreement"
            className="flex-1 w-full bg-white"
            allow="camera; microphone; geolocation; clipboard-write"
          />
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: string; label: string }> = {
    DRAFT: { tone: 'bg-slate-500/20 text-slate-300', label: 'Draft' },
    SENT: { tone: 'bg-blue-500/20 text-blue-300', label: 'Pending' },
    VIEWED: { tone: 'bg-purple-500/20 text-purple-300', label: 'Open' },
    CHANGES_REQUESTED: { tone: 'bg-amber-500/20 text-amber-300', label: 'Changes pending' },
    ACCEPTED: { tone: 'bg-emerald-500/20 text-emerald-300', label: 'Accepted' },
    DECLINED: { tone: 'bg-red-500/20 text-red-300', label: 'Declined' },
  };
  const s = map[status] ?? { tone: '', label: status };
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}
