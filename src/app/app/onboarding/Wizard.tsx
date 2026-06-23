'use client';

/**
 * AI onboarding wizard.
 *
 * 5 steps: Brief → Clarify → Boundaries → Catalog → Review.
 * Auto-saves answers after every step (PATCH /api/onboarding).
 * Generates the Draft on entering Review, then Apply writes the accepted subset.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, ArrowLeft, Check, RotateCcw, Pencil } from 'lucide-react';

type Tone = 'warm' | 'formal' | 'concise' | 'playful';
interface Answers {
  brief?: string;
  toneHint?: Tone;
  standardDepositPercent?: number;
  typicalLeadTimeDays?: number;
  cancellationPolicy?: string;
  outOfScope?: string;
  saleModel?: 'PACKAGES' | 'PER_HEAD' | 'HOURLY' | 'CUSTOM';
  priceRange?: { low?: number; high?: number; currency?: string };
  signatureOffering?: string;
  serviceCategories?: string[];
  serviceAreas?: string[];
  housePhrases?: string[];
  inclusions?: string[];
  exclusions?: string[];
  notes?: string;
}

interface Draft {
  proposalTemplate: {
    coverHtml: string; aboutHtml: string; defaultIntro: string;
    defaultInclusions: string[]; defaultTerms: string[];
    defaultValidityDays: number; defaultDepositPercent: number;
    accentColor: string | null; toneHint: Tone; housePhrases: string[];
  };
  contractTemplate: { name: string; bodyHtml: string };
  catalog: { tableName: string; rows: { name: string; description?: string; unitPrice: number; unit: string }[] } | null;
  aiConfig: { tone: string; customInstructions: string; mandatoryItemSlugs: string[] };
}

const TONES: { k: Tone; label: string; copy: string }[] = [
  { k: 'warm', label: 'Warm', copy: 'Friendly and human, like talking to a trusted vendor.' },
  { k: 'formal', label: 'Formal', copy: 'Clean, professional, corporate-friendly.' },
  { k: 'concise', label: 'Concise', copy: 'Crisp, no fluff, deliverables-first.' },
  { k: 'playful', label: 'Playful', copy: 'Light, fun, visual-forward.' },
];

const SALE_MODELS = [
  { k: 'PACKAGES', label: 'Packages', copy: 'Tier 1 / Tier 2 / Tier 3 bundles.' },
  { k: 'PER_HEAD', label: 'Per head / per guest', copy: 'Catering, events, hospitality.' },
  { k: 'HOURLY', label: 'Hourly / per day', copy: 'Photography, coordination, consulting.' },
  { k: 'CUSTOM', label: 'Custom quote', copy: 'Every project priced from scratch.' },
] as const;

export function OnboardingWizard({
  businessName, businessTypeName, initialAnswers, initialDraft, alreadyCompleted,
}: {
  businessName: string;
  businessTypeName: string;
  initialAnswers: Record<string, unknown>;
  initialDraft: object | null;
  alreadyCompleted: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Answers>(initialAnswers as Answers);
  const [draft, setDraft] = React.useState<Draft | null>(initialDraft as Draft | null);
  const [busy, setBusy] = React.useState(false);
  const [accepted, setAccepted] = React.useState({ proposalTemplate: true, contractTemplate: true, catalog: true, aiConfig: true });

  // ─ persist whenever answers change (debounced) ─
  React.useEffect(() => {
    const t = setTimeout(() => {
      fetch('/api/onboarding', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }) }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [answers]);

  async function extractFromBrief() {
    if (!answers.brief || answers.brief.length < 20) return;
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/extract', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ brief: answers.brief }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAnswers((a) => ({ ...a, ...data.extracted }));
      toast.success('Got it — filled what I could from your brief');
      setStep(1);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/generate', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setDraft(data.draft);
      setStep(4);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function apply() {
    setBusy(true);
    try {
      const res = await fetch('/api/onboarding/apply', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accepted, draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`Applied ${data.applied.length} section${data.applied.length === 1 ? '' : 's'} — you're set up`);
      router.push('/app');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="chip mb-2 inline-flex items-center gap-1.5 text-xs"><Sparkles className="h-3 w-3" /> AI onboarding</div>
          <h1 className="text-2xl font-semibold">Set up {businessName} in 5 minutes</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{businessTypeName} · I'll draft your proposal template, contract, catalog & AI tone from your answers.</p>
        </div>
        {alreadyCompleted && (
          <div className="chip text-xs"><RotateCcw className="h-3 w-3" /> Re-running — your edits stay safe</div>
        )}
      </div>

      <Stepper step={step} />

      <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mt-4 p-6">
        {step === 0 && (
          <Brief value={answers.brief ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, brief: v }))} onNext={extractFromBrief} busy={busy} />
        )}
        {step === 1 && (
          <Clarify answers={answers} setAnswers={setAnswers} onNext={() => setStep(2)} onBack={() => setStep(0)} />
        )}
        {step === 2 && (
          <Boundaries answers={answers} setAnswers={setAnswers} onNext={() => setStep(3)} onBack={() => setStep(1)} />
        )}
        {step === 3 && (
          <CatalogStep answers={answers} setAnswers={setAnswers} onNext={generate} onBack={() => setStep(2)} busy={busy} />
        )}
        {step === 4 && draft && (
          <Review draft={draft} accepted={accepted} setAccepted={setAccepted} onBack={() => setStep(3)} onApply={apply} busy={busy} />
        )}
      </motion.div>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ step }: { step: number }) {
  const labels = ['Brief', 'Clarify', 'Boundaries', 'Catalog', 'Review'];
  return (
    <div className="flex items-center gap-2">
      {labels.map((l, i) => (
        <React.Fragment key={l}>
          <div className={`flex items-center gap-1.5 text-xs ${i === step ? 'font-semibold' : 'text-[var(--color-muted)]'}`}>
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-2)]'}`}>{i < step ? <Check className="h-3 w-3" /> : i + 1}</span>
            {l}
          </div>
          {i < labels.length - 1 && <div className="h-px flex-1 bg-[var(--color-border)]" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: Brief ────────────────────────────────────────────────────────────
function Brief({ value, onChange, onNext, busy }: { value: string; onChange: (v: string) => void; onNext: () => void; busy: boolean }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Tell me about your business</h2>
      <p className="text-sm text-[var(--color-muted)]">
        Pitch it like you would to a new client. The more specific, the better the draft I produce.
      </p>
      <textarea
        value={value} onChange={(e) => onChange(e.target.value)}
        rows={10} placeholder="We're a Mumbai-based catering team specializing in South Indian weddings. We've done 200+ events over 7 years. Average wedding is 300 guests; budget range ₹4-15 lakhs. What clients love: our breakfast counter and the way we handle service. We need 50% deposit, balance 7 days before the event…"
        className="input-base text-sm"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-muted)]">~200 words is ideal · auto-saves as you type</p>
        <button onClick={onNext} disabled={busy || value.length < 20} className="btn-primary">
          {busy ? 'Reading…' : <>Extract & continue <ArrowRight className="h-4 w-4" /></>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Clarify ──────────────────────────────────────────────────────────
function Clarify({ answers, setAnswers, onNext, onBack }: { answers: Answers; setAnswers: React.Dispatch<React.SetStateAction<Answers>>; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">A few quick choices</h2>

      <div>
        <div className="label-base">Tone for your proposals</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {TONES.map((t) => (
            <button key={t.k} onClick={() => setAnswers((a) => ({ ...a, toneHint: t.k }))}
              className={`rounded-xl border p-3 text-left transition ${answers.toneHint === t.k ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'}`}>
              <div className="text-sm font-medium">{t.label}</div>
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{t.copy}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Standard deposit %">
          <input type="number" min={0} max={100} value={answers.standardDepositPercent ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, standardDepositPercent: Number(e.target.value) || undefined }))} placeholder="25" className="input-base text-sm" />
        </Field>
        <Field label="Typical lead time (days clients book ahead)">
          <input type="number" min={1} value={answers.typicalLeadTimeDays ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, typicalLeadTimeDays: Number(e.target.value) || undefined }))} placeholder="60" className="input-base text-sm" />
        </Field>
      </div>

      <Field label="Signature offering (what you're known for)">
        <input value={answers.signatureOffering ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, signatureOffering: e.target.value }))} placeholder="e.g. live tandoor counter and quiet, premium service" className="input-base text-sm" />
      </Field>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button onClick={onNext} disabled={!answers.toneHint} className="btn-primary">Continue <ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ─── Step 3: Boundaries ───────────────────────────────────────────────────────
function Boundaries({ answers, setAnswers, onNext, onBack }: { answers: Answers; setAnswers: React.Dispatch<React.SetStateAction<Answers>>; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">Set the boundaries</h2>
      <p className="text-sm text-[var(--color-muted)]">These go straight into your contract terms and tell the AI what NOT to propose.</p>

      <Field label="Cancellation policy (in your own words)">
        <textarea value={answers.cancellationPolicy ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, cancellationPolicy: e.target.value }))}
          rows={3} placeholder="Cancellations within 14 days of the event date may incur the full fee. Retainer is non-refundable." className="input-base text-sm" />
      </Field>

      <Field label="What you don't do (limits / out-of-scope)">
        <textarea value={answers.outOfScope ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, outOfScope: e.target.value }))}
          rows={3} placeholder="We don't handle alcohol service or DJ booking. Travel outside Mumbai is billed separately." className="input-base text-sm" />
      </Field>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button onClick={onNext} className="btn-primary">Continue <ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// ─── Step 4: Catalog seed ─────────────────────────────────────────────────────
function CatalogStep({ answers, setAnswers, onNext, onBack, busy }: { answers: Answers; setAnswers: React.Dispatch<React.SetStateAction<Answers>>; onNext: () => void; onBack: () => void; busy: boolean }) {
  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">How do clients buy from you?</h2>

      <div className="grid gap-2 md:grid-cols-2">
        {SALE_MODELS.map((m) => (
          <button key={m.k} onClick={() => setAnswers((a) => ({ ...a, saleModel: m.k }))}
            className={`rounded-xl border p-3 text-left transition ${answers.saleModel === m.k ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'}`}>
            <div className="text-sm font-medium">{m.label}</div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{m.copy}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Typical price LOW (₹)">
          <input type="number" min={0} value={answers.priceRange?.low ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, priceRange: { ...a.priceRange, low: Number(e.target.value) || undefined, currency: 'INR' } }))} placeholder="50000" className="input-base text-sm" />
        </Field>
        <Field label="Typical price HIGH (₹)">
          <input type="number" min={0} value={answers.priceRange?.high ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, priceRange: { ...a.priceRange, high: Number(e.target.value) || undefined, currency: 'INR' } }))} placeholder="500000" className="input-base text-sm" />
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button onClick={onNext} disabled={busy} className="btn-primary">
          {busy ? 'Generating…' : <><Sparkles className="h-4 w-4" /> Generate my profile</>}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5: Review ───────────────────────────────────────────────────────────
function Review({ draft, accepted, setAccepted, onBack, onApply, busy }: {
  draft: Draft;
  accepted: { proposalTemplate: boolean; contractTemplate: boolean; catalog: boolean; aiConfig: boolean };
  setAccepted: React.Dispatch<React.SetStateAction<typeof accepted>>;
  onBack: () => void; onApply: () => void; busy: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Here's what I drafted</h2>
      <p className="text-sm text-[var(--color-muted)]">Untick anything you don't want to apply. You can fully edit each later.</p>

      <Section title="Proposal template" accepted={accepted.proposalTemplate} onToggle={() => setAccepted((a) => ({ ...a, proposalTemplate: !a.proposalTemplate }))} editHref="/app/settings/proposal-templates">
        <div className="text-xs text-[var(--color-muted)]">Tone <strong className="text-[var(--color-text)]">{draft.proposalTemplate.toneHint}</strong> · Deposit <strong className="text-[var(--color-text)]">{draft.proposalTemplate.defaultDepositPercent}%</strong> · Valid <strong className="text-[var(--color-text)]">{draft.proposalTemplate.defaultValidityDays}d</strong></div>
        <Snippet html={draft.proposalTemplate.coverHtml} />
        <div className="mt-2 text-xs"><strong>Inclusions:</strong> {draft.proposalTemplate.defaultInclusions.slice(0, 4).join(' · ')}{draft.proposalTemplate.defaultInclusions.length > 4 ? ` +${draft.proposalTemplate.defaultInclusions.length - 4}` : ''}</div>
      </Section>

      <Section title="Contract template" accepted={accepted.contractTemplate} onToggle={() => setAccepted((a) => ({ ...a, contractTemplate: !a.contractTemplate }))} editHref="/app/settings/contracts">
        <div className="text-xs text-[var(--color-muted)]">{draft.contractTemplate.name}</div>
        <Snippet html={draft.contractTemplate.bodyHtml.slice(0, 600) + (draft.contractTemplate.bodyHtml.length > 600 ? '…' : '')} />
      </Section>

      <Section title="Starter catalog" accepted={accepted.catalog} onToggle={() => setAccepted((a) => ({ ...a, catalog: !a.catalog }))} editHref="/app/catalog" disabled={!draft.catalog}>
        {draft.catalog ? (
          <>
            <div className="text-xs text-[var(--color-muted)]">{draft.catalog.tableName} — {draft.catalog.rows.length} items</div>
            <ul className="mt-1 space-y-1 text-xs">
              {draft.catalog.rows.slice(0, 4).map((r, i) => (
                <li key={i} className="flex justify-between"><span>{r.name}</span><span className="tabular-nums">₹{r.unitPrice.toLocaleString('en-IN')} / {r.unit}</span></li>
              ))}
              {draft.catalog.rows.length > 4 && <li className="text-[var(--color-muted)]">+{draft.catalog.rows.length - 4} more</li>}
            </ul>
          </>
        ) : (
          <div className="text-xs text-[var(--color-muted)]">No catalog generated this round.</div>
        )}
      </Section>

      <Section title="AI tone & house phrases" accepted={accepted.aiConfig} onToggle={() => setAccepted((a) => ({ ...a, aiConfig: !a.aiConfig }))} editHref="/app/settings/ai">
        <div className="text-xs text-[var(--color-muted)]">Tone <strong className="text-[var(--color-text)]">{draft.aiConfig.tone}</strong></div>
        {draft.aiConfig.customInstructions && <pre className="mt-1 whitespace-pre-wrap text-xs">{draft.aiConfig.customInstructions}</pre>}
      </Section>

      <div className="flex items-center justify-between border-t pt-4">
        <button onClick={onBack} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Back</button>
        <button onClick={onApply} disabled={busy} className="btn-primary">{busy ? 'Applying…' : 'Apply & finish'}</button>
      </div>
    </div>
  );
}

function Section({ title, accepted, onToggle, editHref, children, disabled }: {
  title: string; accepted: boolean; onToggle: () => void; editHref?: string; disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${accepted && !disabled ? 'border-[var(--color-primary)]/60' : 'border-[var(--color-border)]'} bg-[var(--color-surface-2)] p-3`}>
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" disabled={disabled} checked={accepted && !disabled} onChange={onToggle} />
          {title}
        </label>
        {editHref && <a href={editHref} target="_blank" rel="noreferrer" className="btn-ghost px-2 py-1 text-xs"><Pencil className="h-3 w-3" /> Edit after</a>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Snippet({ html }: { html: string }) {
  return <div className="mt-1 max-h-32 overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-xs" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}
