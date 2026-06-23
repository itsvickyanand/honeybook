'use client';

/**
 * Workspace action bar: Attach · AI actions · Create file.
 *
 * AI actions (all call POST /api/projects/:id/ai/<verb>):
 *   - Draft project summary  → /summarize
 *   - Draft email            → /draft-email
 *   - Suggest services       → /suggest-services
 *   - Suggest action items   → /suggest-action-items  (+ "Create as task" inline)
 *   - Analyze client sentiment → /analyze-sentiment
 *   - Ask something about this project → /ask  (free-form Q&A)
 *   - Draft a proposal with AI → just navigates to /app/proposals/new
 *
 * Each modal: loading spinner → result. Where applicable: Copy, Regenerate,
 * Convert to Task, mailto.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Paperclip, Sparkles, FilePlus, ChevronDown, Loader2, Copy, Mail, RefreshCw,
  FileText, PenLine, Lightbulb, ClipboardList, HeartPulse, MessageSquareText, Send,
  CheckCircle2, AlertTriangle, Smile,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

type EmailKind = 'status_update' | 'check_in' | 'payment_nudge' | 'next_steps';
type AiMode = null | 'summary' | 'email' | 'services' | 'actions' | 'sentiment' | 'ask';

const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  status_update: 'Status update',
  check_in: 'Friendly check-in',
  payment_nudge: 'Payment nudge',
  next_steps: 'Next steps',
};

interface ServiceSuggestion {
  name: string;
  reason: string;
  estimatedPrice: string | null;
  catalogRowId: string | null;
}

interface ActionItem {
  title: string;
  estimateMinutes: number;
  suggestedOwner: string;
  reason: string;
  urgency: 'SOON' | 'THIS_WEEK' | 'THIS_MONTH';
}

interface SentimentAnalysis {
  sentiment: 'positive' | 'neutral' | 'at-risk';
  score: number;
  signals: { label: string; impact: 'positive' | 'negative' | 'neutral' }[];
  reasoning: string;
  suggestedActions: string[];
}

export function ProjectActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Shared modal state
  const [aiMode, setAiMode] = React.useState<AiMode>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiMock, setAiMock] = React.useState(false);

  // Per-action result state
  const [summaryText, setSummaryText] = React.useState('');
  const [emailKind, setEmailKind] = React.useState<EmailKind>('status_update');
  const [emailSubject, setEmailSubject] = React.useState('');
  const [emailBody, setEmailBody] = React.useState('');
  const [emailTo, setEmailTo] = React.useState<string | null>(null);
  const [services, setServices] = React.useState<ServiceSuggestion[]>([]);
  const [actions, setActions] = React.useState<ActionItem[]>([]);
  const [sentiment, setSentiment] = React.useState<SentimentAnalysis | null>(null);
  const [question, setQuestion] = React.useState('');
  const [answer, setAnswer] = React.useState('');
  const [askedQuestion, setAskedQuestion] = React.useState('');

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const pres = await fetch('/api/files/sign-upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', prefix: 'project' }),
      });
      const pd = await pres.json();
      if (!pres.ok) throw new Error(pd.error ?? 'Presign failed');
      await fetch(pd.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', ...(pd.headers ?? {}) }, body: file });
      const reg = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageKey: pd.storageKey, filename: file.name, mimeType: file.type, bytes: file.size }),
      });
      if (!reg.ok) throw new Error('Could not attach');
      toast.success('File attached');
      router.refresh();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  // ─── Single dispatcher for the simple actions (POST, set state). ───────────
  async function runSimple(
    mode: Exclude<AiMode, null | 'ask' | 'email'>,
    endpoint: string,
    apply: (data: Record<string, unknown>) => void,
  ) {
    setAiOpen(false);
    setAiMode(mode);
    setAiLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/${endpoint}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      apply(data);
      setAiMock(!!data.mock);
    } catch (err) {
      toast.error((err as Error).message);
      setAiMode(null);
    } finally {
      setAiLoading(false);
    }
  }

  const runSummary = () => runSimple('summary', 'summarize', (d) => setSummaryText(d.summary as string));
  const runServices = () => runSimple('services', 'suggest-services', (d) => setServices((d.suggestions as ServiceSuggestion[]) ?? []));
  const runActions = () => runSimple('actions', 'suggest-action-items', (d) => setActions((d.items as ActionItem[]) ?? []));
  const runSentiment = () => runSimple('sentiment', 'analyze-sentiment', (d) => setSentiment((d.analysis as SentimentAnalysis) ?? null));

  async function runDraftEmail(kind: EmailKind) {
    setAiOpen(false);
    setAiMode('email');
    setAiLoading(true);
    setEmailKind(kind);
    setEmailSubject(''); setEmailBody('');
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/draft-email`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setEmailSubject(data.subject);
      setEmailBody(data.body);
      setAiMock(!!data.mock);
      const proj = await fetch(`/api/projects/${projectId}`).then((r) => r.ok ? r.json() : null);
      setEmailTo(proj?.project?.contact?.email ?? null);
    } catch (err) { toast.error((err as Error).message); setAiMode(null); }
    finally { setAiLoading(false); }
  }

  async function runAsk() {
    if (!question.trim()) return;
    setAiLoading(true);
    setAnswer('');
    setAskedQuestion(question.trim());
    try {
      const res = await fetch(`/api/projects/${projectId}/ai/ask`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setAnswer(data.answer);
      setAiMock(!!data.mock);
    } catch (err) { toast.error((err as Error).message); }
    finally { setAiLoading(false); }
  }

  function openAsk() {
    setAiOpen(false);
    setAiMode('ask');
    setQuestion(''); setAnswer(''); setAskedQuestion('');
    setAiMock(false);
  }

  // Convert an AI-suggested action item into a real Task.
  async function convertToTask(item: ActionItem) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          projectId,
          estimateMinutes: item.estimateMinutes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Failed');
      }
      toast.success('Added to tasks');
      // Remove the converted item from the list so the vendor sees progress.
      setActions((prev) => prev.filter((i) => i !== item));
      router.refresh();
    } catch (err) { toast.error((err as Error).message); }
  }

  function copy(text: string, msg = 'Copied') {
    navigator.clipboard.writeText(text).then(() => toast.success(msg));
  }
  function openMailto() {
    const url = `mailto:${emailTo ?? ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = url;
  }
  function closeAi() {
    setAiMode(null);
    setSummaryText(''); setEmailSubject(''); setEmailBody('');
    setServices([]); setActions([]); setSentiment(null);
    setQuestion(''); setAnswer(''); setAskedQuestion('');
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" className="hidden" onChange={onAttach} />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ghost text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Attach
      </button>

      <div className="relative">
        <button onClick={() => { setAiOpen((o) => !o); setCreateOpen(false); }} className="btn-ghost text-sm">
          <Sparkles className="h-4 w-4 text-[var(--color-primary-soft)]" /> AI actions <ChevronDown className="h-3 w-3" />
        </button>
        {aiOpen && (
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm shadow-xl">
            <Link href={`/app/proposals/new?project=${projectId}`} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">
              <FileText className="h-4 w-4 text-[var(--color-muted)]" /> Draft a proposal with AI
            </Link>
            <button onClick={runSummary} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <PenLine className="h-4 w-4 text-[var(--color-muted)]" /> Draft project summary
            </button>
            <button onClick={() => runDraftEmail('status_update')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <Mail className="h-4 w-4 text-[var(--color-muted)]" /> Draft email
            </button>
            <button onClick={runServices} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <Lightbulb className="h-4 w-4 text-[var(--color-muted)]" /> Suggest services
            </button>
            <button onClick={runActions} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <ClipboardList className="h-4 w-4 text-[var(--color-muted)]" /> Suggest action items
            </button>
            <button onClick={runSentiment} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <HeartPulse className="h-4 w-4 text-[var(--color-muted)]" /> Analyze client sentiment
            </button>
            <div className="my-1 border-t border-[var(--color-border)]" />
            <button onClick={openAsk} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">
              <MessageSquareText className="h-4 w-4 text-[var(--color-muted)]" /> Ask something about this project
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => { setCreateOpen((o) => !o); setAiOpen(false); }} className="btn-primary text-sm">
          <FilePlus className="h-4 w-4" /> Create file <ChevronDown className="h-3 w-3" />
        </button>
        {createOpen && (
          <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm shadow-xl">
            <Link href={`/app/proposals/new?project=${projectId}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Proposal</Link>
            <Link href={`/app/projects/${projectId}?tab=financials`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Invoice</Link>
            <button onClick={() => fileRef.current?.click()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">Upload a file</button>
          </div>
        )}
      </div>

      {/* ─────────── Modals ─────────── */}

      {/* Summary */}
      <Modal open={aiMode === 'summary'} onClose={closeAi} title={<TitleIcon icon={PenLine} text="Project summary" />} size="lg">
        {aiLoading ? <Loading text="Reading the project, drafting the summary…" /> : (
          <div className="space-y-4">
            {aiMock && <DemoBanner />}
            <pre className="whitespace-pre-wrap rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 text-sm leading-relaxed font-sans">{summaryText}</pre>
            <FooterActions>
              <Button variant="ghost" onClick={runSummary}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
              <Button onClick={() => copy(summaryText, 'Summary copied')}><Copy className="h-4 w-4" /> Copy</Button>
            </FooterActions>
          </div>
        )}
      </Modal>

      {/* Email */}
      <Modal open={aiMode === 'email'} onClose={closeAi} title={<TitleIcon icon={Mail} text="Draft client email" />} size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EMAIL_KIND_LABELS) as EmailKind[]).map((k) => (
              <button
                key={k}
                onClick={() => runDraftEmail(k)}
                disabled={aiLoading}
                className={`chip transition ${emailKind === k ? 'border-[var(--color-primary)]/60 text-white' : 'hover:border-[var(--color-primary)]/40'}`}
              >
                {EMAIL_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          {aiLoading ? <Loading text="Pulling project context, drafting…" /> : (
            <>
              {aiMock && <DemoBanner />}
              <div>
                <label className="label-base">Subject</label>
                <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="input-base w-full text-sm" />
              </div>
              <div>
                <label className="label-base">Body</label>
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={12} className="input-base w-full text-sm font-sans" />
              </div>
              <FooterActions>
                <Button variant="ghost" onClick={() => runDraftEmail(emailKind)}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
                <Button variant="ghost" onClick={() => copy(`Subject: ${emailSubject}\n\n${emailBody}`, 'Email copied')}><Copy className="h-4 w-4" /> Copy</Button>
                <Button onClick={openMailto} disabled={!emailTo}>
                  <Mail className="h-4 w-4" /> {emailTo ? `Send to ${emailTo}` : 'No client email on file'}
                </Button>
              </FooterActions>
            </>
          )}
        </div>
      </Modal>

      {/* Services */}
      <Modal open={aiMode === 'services'} onClose={closeAi} title={<TitleIcon icon={Lightbulb} text="Service suggestions" />} size="lg">
        {aiLoading ? <Loading text="Scanning your catalog + this project…" /> : (
          <div className="space-y-4">
            {aiMock && <DemoBanner />}
            {services.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">No suggestions returned.</p>
            ) : (
              <ul className="space-y-2">
                {services.map((s, i) => (
                  <li key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium">{s.name}</div>
                      {s.estimatedPrice && <div className="text-xs text-[var(--color-muted)] whitespace-nowrap">{s.estimatedPrice}</div>}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{s.reason}</p>
                    {s.catalogRowId && <div className="mt-2 text-[10px] uppercase tracking-wider text-[var(--color-primary-soft)]">From your catalog</div>}
                  </li>
                ))}
              </ul>
            )}
            <FooterActions>
              <Button variant="ghost" onClick={runServices}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
              <Button onClick={() => copy(services.map((s) => `• ${s.name}${s.estimatedPrice ? ` — ${s.estimatedPrice}` : ''}\n  ${s.reason}`).join('\n\n'), 'Suggestions copied')}><Copy className="h-4 w-4" /> Copy list</Button>
            </FooterActions>
          </div>
        )}
      </Modal>

      {/* Action items */}
      <Modal open={aiMode === 'actions'} onClose={closeAi} title={<TitleIcon icon={ClipboardList} text="Suggested action items" />} size="lg">
        {aiLoading ? <Loading text="Picking the next 5-8 things to do…" /> : (
          <div className="space-y-4">
            {aiMock && <DemoBanner />}
            {actions.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">Nothing left to suggest — looking good.</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a, i) => (
                  <li key={i} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="font-medium">{a.title}</div>
                      <UrgencyChip urgency={a.urgency} />
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{a.reason}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[var(--color-muted)]">{a.suggestedOwner} · ~{a.estimateMinutes} min</span>
                      <button
                        onClick={() => convertToTask(a)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:border-[var(--color-primary)]/60"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Add as task
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <FooterActions>
              <Button variant="ghost" onClick={runActions}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
            </FooterActions>
          </div>
        )}
      </Modal>

      {/* Sentiment */}
      <Modal open={aiMode === 'sentiment'} onClose={closeAi} title={<TitleIcon icon={HeartPulse} text="Client sentiment" />} size="lg">
        {aiLoading ? <Loading text="Reading recent messages + activity…" /> : sentiment ? (
          <div className="space-y-4">
            {aiMock && <DemoBanner />}
            <div className={`rounded-xl border p-4 ${sentimentClasses(sentiment.sentiment)}`}>
              <div className="flex items-center gap-3">
                {sentiment.sentiment === 'positive' && <Smile className="h-5 w-5" />}
                {sentiment.sentiment === 'at-risk' && <AlertTriangle className="h-5 w-5" />}
                {sentiment.sentiment === 'neutral' && <HeartPulse className="h-5 w-5" />}
                <div>
                  <div className="text-sm font-semibold capitalize">{sentiment.sentiment.replace('-', ' ')}</div>
                  <div className="text-xs opacity-80">Health score: {sentiment.score}/100</div>
                </div>
              </div>
              <p className="mt-3 text-sm">{sentiment.reasoning}</p>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Signals</div>
              <ul className="space-y-1.5 text-sm">
                {sentiment.signals.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.impact === 'positive' ? 'bg-emerald-400' : s.impact === 'negative' ? 'bg-red-400' : 'bg-[var(--color-muted)]'}`} />
                    {s.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Do this week</div>
              <ul className="list-disc pl-5 text-sm space-y-1">
                {sentiment.suggestedActions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
            <FooterActions>
              <Button variant="ghost" onClick={runSentiment}><RefreshCw className="h-4 w-4" /> Re-analyze</Button>
            </FooterActions>
          </div>
        ) : null}
      </Modal>

      {/* Ask */}
      <Modal open={aiMode === 'ask'} onClose={closeAi} title={<TitleIcon icon={MessageSquareText} text="Ask about this project" />} size="lg">
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="label-base">Your question</label>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !aiLoading) runAsk(); }}
                placeholder="e.g. What's outstanding from the client side?"
                className="input-base w-full text-sm"
                autoFocus
              />
            </div>
            <Button onClick={runAsk} disabled={!question.trim() || aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Ask
            </Button>
          </div>
          {aiMock && answer && <DemoBanner />}
          {askedQuestion && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">You asked</div>
              <div className="mt-1 text-sm">{askedQuestion}</div>
              {answer && (
                <>
                  <div className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Answer</div>
                  <pre className="mt-1 whitespace-pre-wrap text-sm leading-relaxed font-sans">{answer}</pre>
                </>
              )}
              {aiLoading && <div className="mt-4 text-sm text-[var(--color-muted)] inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
            </div>
          )}
          {answer && (
            <FooterActions>
              <Button variant="ghost" onClick={() => copy(answer, 'Answer copied')}><Copy className="h-4 w-4" /> Copy answer</Button>
            </FooterActions>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─── small presentational helpers ───────────────────────────────────────────
function TitleIcon({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return <span className="inline-flex items-center gap-2"><Icon className="h-4 w-4 text-[var(--color-primary)]" /> {text}</span>;
}
function Loading({ text }: { text: string }) {
  return <div className="flex items-center gap-3 py-12 text-sm text-[var(--color-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> {text}</div>;
}
function DemoBanner() {
  return (
    <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
      Demo mode — add ANTHROPIC_API_KEY for Claude output. Below is a deterministic template using your project data.
    </div>
  );
}
function FooterActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}
function UrgencyChip({ urgency }: { urgency: ActionItem['urgency'] }) {
  const styles: Record<ActionItem['urgency'], string> = {
    SOON:       'bg-red-500/20 text-red-300 border-red-500/40',
    THIS_WEEK:  'bg-amber-500/20 text-amber-300 border-amber-500/40',
    THIS_MONTH: 'bg-[var(--color-muted)]/20 text-[var(--color-muted)] border-[var(--color-border)]',
  };
  const labels = { SOON: 'Soon', THIS_WEEK: 'This week', THIS_MONTH: 'This month' };
  return <span className={`chip ${styles[urgency]} text-[10px]`}>{labels[urgency]}</span>;
}
function sentimentClasses(s: SentimentAnalysis['sentiment']) {
  if (s === 'positive') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  if (s === 'at-risk')  return 'border-red-500/40 bg-red-500/10 text-red-200';
  return 'border-[var(--color-border)] bg-[var(--color-surface-2)]';
}
