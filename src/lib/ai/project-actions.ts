/**
 * AI helpers for the project workspace's "AI actions" dropdown.
 *
 *   summarizeProject(projectId) → 5-bullet status summary the vendor can paste into an update.
 *   draftClientEmail(projectId, kind?) → { subject, body } draft email tailored to project context.
 *
 * Both fall back to a deterministic local template when ANTHROPIC_API_KEY is missing,
 * so the action always returns something usable (demo-friendly).
 */
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { logger } from '../logger';
import { formatCurrency } from '../utils';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5-20251008';

function client() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
}

interface ProjectContextRow {
  projectName: string;
  stage: string;
  status: string;
  description: string | null;
  clientName: string;
  clientEmail: string | null;
  startDate: Date | null;
  endDate: Date | null;
  tenantName: string;
  vendorName: string;
  currency: string;
  locale: string;
  toneHint: string;
  tasksOpen: number;
  tasksDone: number;
  invoiceTotal: number;
  invoicePaid: number;
  invoiceOpen: number;
  recentActivity: { title: string; createdAt: Date }[];
  recentNotes: string[];
}

/** Load all the context the AI needs in one round-trip. */
export async function loadProjectContext(tenantId: string, projectId: string): Promise<ProjectContextRow | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, tenantId },
    include: {
      contact: { select: { fullName: true, email: true } },
      tasks: { select: { status: true } },
      invoices: { select: { total: true, amountPaid: true } },
      tenant: {
        select: {
          name: true,
          currency: true,
          locale: true,
          aiConfig: { select: { tone: true } },
        },
      },
    },
  });
  if (!project) return null;

  const recentActivity = await prisma.activity.findMany({
    where: { tenantId, projectId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { title: true, createdAt: true },
  });

  const tasksDone = project.tasks.filter((t) => t.status === 'DONE').length;
  const tasksOpen = project.tasks.length - tasksDone;
  const invoiceTotal = project.invoices.reduce((s, i) => s + i.total, 0);
  const invoicePaid = project.invoices.reduce((s, i) => s + i.amountPaid, 0);

  return {
    projectName: project.name,
    stage: project.stage,
    status: project.status,
    description: project.description,
    clientName: project.contact?.fullName ?? 'Client',
    clientEmail: project.contact?.email ?? null,
    startDate: project.startDate,
    endDate: project.endDate,
    tenantName: project.tenant.name,
    vendorName: project.tenant.name,
    currency: project.tenant.currency,
    locale: project.tenant.locale,
    toneHint: project.tenant.aiConfig?.tone ?? 'warm',
    tasksOpen,
    tasksDone,
    invoiceTotal,
    invoicePaid,
    invoiceOpen: invoiceTotal - invoicePaid,
    recentActivity,
    recentNotes: project.notesText ? [project.notesText.slice(0, 2000)] : [],
  };
}

function contextBlock(ctx: ProjectContextRow): string {
  const fmt = (n: number) => formatCurrency(n, ctx.currency, ctx.locale);
  const lines = [
    `Vendor: ${ctx.vendorName}`,
    `Client: ${ctx.clientName}${ctx.clientEmail ? ` <${ctx.clientEmail}>` : ''}`,
    `Project: ${ctx.projectName}`,
    `Stage: ${ctx.stage} · Status: ${ctx.status}`,
    ctx.startDate ? `Start: ${ctx.startDate.toISOString().slice(0, 10)}` : '',
    ctx.endDate ? `End: ${ctx.endDate.toISOString().slice(0, 10)}` : '',
    `Tasks: ${ctx.tasksDone} done / ${ctx.tasksOpen} open`,
    `Money: ${fmt(ctx.invoicePaid)} paid of ${fmt(ctx.invoiceTotal)} (${fmt(ctx.invoiceOpen)} outstanding)`,
    ctx.description ? `Brief: ${ctx.description.slice(0, 500)}` : '',
    ctx.recentNotes.length ? `Notes: ${ctx.recentNotes.join(' | ').slice(0, 500)}` : '',
    ctx.recentActivity.length
      ? `Recent activity:\n${ctx.recentActivity.map((a) => `  - ${a.title} (${a.createdAt.toISOString().slice(0, 10)})`).join('\n')}`
      : '',
  ].filter(Boolean);
  return lines.join('\n');
}

// ─── 1. summarizeProject ──────────────────────────────────────────────────────
export async function summarizeProject(tenantId: string, projectId: string): Promise<{ summary: string; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');
  const ai = client();
  if (!ai) return { summary: fallbackSummary(ctx), mock: true };

  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: `You write crisp project status summaries for service vendors. Output 4-6 bullet points in markdown (use "- " prefix). Cover: where the project is, what's done, what's outstanding (money + tasks), and the single next step. Be specific — use names, dates, and amounts from the context. Tone: ${ctx.toneHint}. No preamble, no closing line — just the bullets.`,
      messages: [{ role: 'user', content: contextBlock(ctx) }],
    });
    const text = (resp.content[0] as { text: string }).text.trim();
    return { summary: text, mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.summarize.failed');
    return { summary: fallbackSummary(ctx), mock: true };
  }
}

function fallbackSummary(ctx: ProjectContextRow): string {
  const fmt = (n: number) => formatCurrency(n, ctx.currency, ctx.locale);
  const lines = [
    `- **${ctx.projectName}** with ${ctx.clientName} is in ${ctx.stage.toLowerCase()} (${ctx.status.toLowerCase()}).`,
    `- ${ctx.tasksDone} task${ctx.tasksDone === 1 ? '' : 's'} done, ${ctx.tasksOpen} still open.`,
    `- ${fmt(ctx.invoicePaid)} collected of ${fmt(ctx.invoiceTotal)} invoiced (${fmt(ctx.invoiceOpen)} outstanding).`,
  ];
  if (ctx.endDate) lines.push(`- Target delivery: ${ctx.endDate.toISOString().slice(0, 10)}.`);
  if (ctx.recentActivity[0]) lines.push(`- Most recent: ${ctx.recentActivity[0].title}.`);
  return lines.join('\n');
}

// ─── 2. draftClientEmail ──────────────────────────────────────────────────────
export type EmailKind = 'status_update' | 'check_in' | 'payment_nudge' | 'next_steps';

export async function draftClientEmail(
  tenantId: string,
  projectId: string,
  kind: EmailKind = 'status_update',
): Promise<{ subject: string; body: string; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');
  const ai = client();
  if (!ai) return { ...fallbackEmail(ctx, kind), mock: true };

  const kindGuide: Record<EmailKind, string> = {
    status_update: 'Share where the project stands and confirm the next milestone.',
    check_in: 'Touch base warmly, ask if anything has changed on their end.',
    payment_nudge: 'Politely remind about the outstanding amount and how to pay.',
    next_steps: 'Lay out the concrete next 1-3 steps and who does what.',
  };

  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: `You draft client emails for a service vendor. Output JSON ONLY:
{ "subject": "<short, specific subject line>", "body": "<email body as plain text with \\n line breaks, no HTML>" }
Guidance:
- Purpose: ${kindGuide[kind]}
- Tone: ${ctx.toneHint}
- Address the client by first name.
- Reference 1-2 specific project facts from the context (stage, tasks, money, dates).
- End with a clear question or single CTA.
- Sign off with the vendor's name only — no email signature block.
- 100-150 words.`,
      messages: [{ role: 'user', content: contextBlock(ctx) }],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { ...fallbackEmail(ctx, kind), mock: true };
    const parsed = JSON.parse(m[0]) as { subject: string; body: string };
    return { subject: parsed.subject, body: parsed.body, mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.draft-email.failed');
    return { ...fallbackEmail(ctx, kind), mock: true };
  }
}

function fallbackEmail(ctx: ProjectContextRow, kind: EmailKind): { subject: string; body: string } {
  const firstName = ctx.clientName.split(' ')[0];
  const fmt = (n: number) => formatCurrency(n, ctx.currency, ctx.locale);
  if (kind === 'payment_nudge') {
    return {
      subject: `Quick note on ${ctx.projectName}`,
      body: `Hi ${firstName},\n\nJust circling back on ${ctx.projectName} — we still have ${fmt(ctx.invoiceOpen)} outstanding against the invoice. Could you confirm a payment date so we can plan the next phase?\n\nHappy to send the payment link again if helpful.\n\nThanks,\n${ctx.vendorName}`,
    };
  }
  if (kind === 'next_steps') {
    return {
      subject: `${ctx.projectName} — next steps`,
      body: `Hi ${firstName},\n\nQuick recap of where we are on ${ctx.projectName}: ${ctx.tasksDone} items are complete and ${ctx.tasksOpen} are still in flight. Here's what we'd like to lock in next:\n\n1. Confirm the upcoming milestone date${ctx.endDate ? ` (we're aiming for ${ctx.endDate.toISOString().slice(0, 10)})` : ''}.\n2. Share any feedback on the most recent deliverable.\n\nLet me know what works.\n\n${ctx.vendorName}`,
    };
  }
  if (kind === 'check_in') {
    return {
      subject: `Checking in on ${ctx.projectName}`,
      body: `Hi ${firstName},\n\nHope you're doing well. Wanted to touch base on ${ctx.projectName} — anything changed on your end we should know about?\n\nOn our side we're tracking ${ctx.tasksDone}/${ctx.tasksOpen + ctx.tasksDone} items done. Let me know if you'd like a quick call to align.\n\n${ctx.vendorName}`,
    };
  }
  return {
    subject: `${ctx.projectName} — status update`,
    body: `Hi ${firstName},\n\nQuick update on ${ctx.projectName}: we're in ${ctx.stage.toLowerCase()} with ${ctx.tasksDone} tasks done and ${ctx.tasksOpen} in progress. Financially we're at ${fmt(ctx.invoicePaid)} of ${fmt(ctx.invoiceTotal)} collected${ctx.invoiceOpen > 0 ? ` (${fmt(ctx.invoiceOpen)} still outstanding)` : ''}.\n\nLet me know if you'd like a deeper dive on any piece.\n\n${ctx.vendorName}`,
  };
}

// ─── 3. suggestServices ───────────────────────────────────────────────────────
/** Pulls the tenant's catalog and asks Claude which 3-6 items would be a great
 *  add-on for this specific project. Returns items with name + price hint +
 *  reasoning. Useful for upsells / proposal revisions. */
export interface ServiceSuggestion {
  name: string;
  reason: string;
  estimatedPrice: string | null;
  /** ID from CustomRow if it matched the catalog, null if AI invented it. */
  catalogRowId: string | null;
}

export async function suggestServices(
  tenantId: string,
  projectId: string,
): Promise<{ suggestions: ServiceSuggestion[]; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');

  // Pull a slice of the catalog so Claude can pick real items by ID. Cap at
  // ~80 rows to stay within the prompt budget.
  const catalog = await prisma.customRow.findMany({
    where: { table: { tenantId } },
    take: 80,
    select: { id: true, data: true, table: { select: { name: true } } },
  });
  const catalogStr = catalog.map((r) => {
    const d = r.data as { name?: string; description?: string; unitPrice?: number; unit?: string } | null;
    return `[${r.id}] ${r.table.name} — ${d?.name ?? '?'} · ${d?.unitPrice ?? '?'} per ${d?.unit ?? 'unit'}${d?.description ? ` — ${d.description}` : ''}`;
  }).join('\n').slice(0, 6000);

  const ai = client();
  if (!ai) return { suggestions: fallbackSuggestServices(ctx), mock: true };
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You suggest 3-6 SPECIFIC add-on services for an in-flight project. Prefer items from the vendor's catalog (cite the [ID]). Each suggestion includes: name, one-line reason tied to project state, an estimated price hint. Output JSON ONLY:
{ "suggestions": [{ "name": string, "reason": string, "estimatedPrice": string|null, "catalogRowId": string|null }] }
Tone: ${ctx.toneHint}. Currency: ${ctx.currency}.`,
      messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nVendor catalog (subset):\n${catalogStr}` }],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { suggestions: fallbackSuggestServices(ctx), mock: true };
    const parsed = JSON.parse(m[0]) as { suggestions: ServiceSuggestion[] };
    return { suggestions: parsed.suggestions.slice(0, 6), mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.suggest-services.failed');
    return { suggestions: fallbackSuggestServices(ctx), mock: true };
  }
}

function fallbackSuggestServices(ctx: ProjectContextRow): ServiceSuggestion[] {
  return [
    { name: 'Add-on review session', reason: `${ctx.projectName} could benefit from a structured mid-point check-in`, estimatedPrice: null, catalogRowId: null },
    { name: 'Express turnaround', reason: 'Compress timeline before delivery', estimatedPrice: null, catalogRowId: null },
    { name: 'Post-delivery support', reason: 'Two weeks of touch-ups after handover', estimatedPrice: null, catalogRowId: null },
  ];
}

// ─── 4. suggestActionItems ────────────────────────────────────────────────────
/** Returns 5-8 concrete TODOs the vendor should consider creating as Tasks. */
export interface ActionItem {
  title: string;
  /** Rough estimate so the vendor can plan capacity. */
  estimateMinutes: number;
  /** Suggested role/team to own it (e.g. "design", "client", "ops"). */
  suggestedOwner: string;
  /** Why this matters now. */
  reason: string;
  /** SOON | THIS_WEEK | THIS_MONTH */
  urgency: 'SOON' | 'THIS_WEEK' | 'THIS_MONTH';
}

export async function suggestActionItems(
  tenantId: string,
  projectId: string,
): Promise<{ items: ActionItem[]; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');
  const ai = client();
  if (!ai) return { items: fallbackActionItems(ctx), mock: true };
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You generate 5-8 concrete action items for an in-flight project. Focus on what's most useful given the project's current stage, outstanding money, and recent activity. Output JSON ONLY:
{ "items": [{ "title": string, "estimateMinutes": number, "suggestedOwner": string, "reason": string, "urgency": "SOON"|"THIS_WEEK"|"THIS_MONTH" }] }
- Be specific (not "follow up with client" — say "send Priya the venue walkthrough video by Tue").
- Mix client-side asks and internal work.
- estimateMinutes: realistic.
- Order by urgency.`,
      messages: [{ role: 'user', content: contextBlock(ctx) }],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { items: fallbackActionItems(ctx), mock: true };
    const parsed = JSON.parse(m[0]) as { items: ActionItem[] };
    return { items: parsed.items.slice(0, 8), mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.suggest-actions.failed');
    return { items: fallbackActionItems(ctx), mock: true };
  }
}

function fallbackActionItems(ctx: ProjectContextRow): ActionItem[] {
  const items: ActionItem[] = [];
  if (ctx.invoiceOpen > 0) {
    items.push({
      title: `Follow up on outstanding ${formatCurrency(ctx.invoiceOpen, ctx.currency, ctx.locale)}`,
      estimateMinutes: 15, suggestedOwner: 'finance', reason: 'Payment not yet received', urgency: 'SOON',
    });
  }
  if (ctx.tasksOpen > 0) {
    items.push({
      title: `Review the ${ctx.tasksOpen} open task${ctx.tasksOpen === 1 ? '' : 's'} and re-assign if needed`,
      estimateMinutes: 20, suggestedOwner: 'delivery lead', reason: 'Open tasks may be stuck', urgency: 'THIS_WEEK',
    });
  }
  items.push({
    title: `Send ${ctx.clientName.split(' ')[0]} a status update`,
    estimateMinutes: 10, suggestedOwner: 'account manager', reason: 'Keeps client warm', urgency: 'THIS_WEEK',
  });
  if (ctx.endDate) {
    items.push({
      title: `Confirm delivery date (${ctx.endDate.toISOString().slice(0, 10)})`,
      estimateMinutes: 5, suggestedOwner: 'delivery lead', reason: 'Lock the date with client', urgency: 'SOON',
    });
  }
  return items;
}

// ─── 5. analyzeClientSentiment ────────────────────────────────────────────────
export interface SentimentAnalysis {
  sentiment: 'positive' | 'neutral' | 'at-risk';
  score: number; // 0-100
  signals: { label: string; impact: 'positive' | 'negative' | 'neutral' }[];
  reasoning: string;
  suggestedActions: string[];
}

export async function analyzeClientSentiment(
  tenantId: string,
  projectId: string,
): Promise<{ analysis: SentimentAnalysis; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');

  // Pull recent client-side messages too (best signal for sentiment).
  // Messages belong to a ChatThread tied to a contact, not directly to a
  // project — resolve via the project's contact.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { contactId: true },
  });
  const messages = project?.contactId
    ? await prisma.message.findMany({
        where: { tenantId, thread: { contactId: project.contactId } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { body: true, direction: true, createdAt: true },
      })
    : [];
  const msgStr = messages.map((m) => `[${m.direction}] ${m.body.slice(0, 200)}`).join('\n').slice(0, 4000);

  const ai = client();
  if (!ai) return { analysis: fallbackSentiment(ctx), mock: true };
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: `You analyze client sentiment on a service project based on recent messages, payment behavior, and activity. Output JSON ONLY:
{
  "sentiment": "positive"|"neutral"|"at-risk",
  "score": 0-100,            // higher = healthier
  "signals": [{ "label": string, "impact": "positive"|"negative"|"neutral" }],
  "reasoning": "<2-3 sentences>",
  "suggestedActions": [string, ...]   // 2-4 specific things to do this week
}
Be calibrated. Late payments, lack of response, escalating tone → at-risk. Quick replies, on-time payments, expressed satisfaction → positive.`,
      messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nRecent messages (newest first):\n${msgStr || '(none)'}` }],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { analysis: fallbackSentiment(ctx), mock: true };
    return { analysis: JSON.parse(m[0]) as SentimentAnalysis, mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.sentiment.failed');
    return { analysis: fallbackSentiment(ctx), mock: true };
  }
}

function fallbackSentiment(ctx: ProjectContextRow): SentimentAnalysis {
  // Naive heuristic — payments outstanding + no recent activity = at-risk.
  const stale = !ctx.recentActivity[0] || (Date.now() - ctx.recentActivity[0].createdAt.getTime()) > 14 * 86400_000;
  const owesMoney = ctx.invoiceOpen > 0;
  const score = 60 - (stale ? 20 : 0) - (owesMoney ? 15 : 0) + (ctx.tasksDone > ctx.tasksOpen ? 10 : 0);
  const sentiment: SentimentAnalysis['sentiment'] = score >= 70 ? 'positive' : score <= 45 ? 'at-risk' : 'neutral';
  const signals: SentimentAnalysis['signals'] = [
    { label: stale ? 'No activity in 2+ weeks' : 'Recent activity', impact: stale ? 'negative' : 'positive' },
    { label: owesMoney ? `${formatCurrency(ctx.invoiceOpen, ctx.currency, ctx.locale)} outstanding` : 'Invoices current', impact: owesMoney ? 'negative' : 'positive' },
    { label: `${ctx.tasksDone}/${ctx.tasksDone + ctx.tasksOpen} tasks done`, impact: ctx.tasksDone >= ctx.tasksOpen ? 'positive' : 'neutral' },
  ];
  return {
    sentiment, score: Math.max(0, Math.min(100, score)), signals,
    reasoning: stale ? 'No recent touchpoint — the client may feel out of the loop.' : 'Activity is regular, no red flags surfaced.',
    suggestedActions: [
      stale ? 'Send a status update today' : 'Confirm next milestone with the client',
      owesMoney ? 'Nudge on outstanding payment' : 'Plan the next deliverable',
    ],
  };
}

// ─── 6. askAboutProject ───────────────────────────────────────────────────────
/** Free-form Q&A over project context. */
export async function askAboutProject(
  tenantId: string,
  projectId: string,
  question: string,
): Promise<{ answer: string; mock: boolean }> {
  const ctx = await loadProjectContext(tenantId, projectId);
  if (!ctx) throw new Error('Project not found');
  const ai = client();
  if (!ai) {
    return {
      answer: `(Demo mode — set ANTHROPIC_API_KEY to enable real Q&A.)\n\nBased on what I can see: stage is ${ctx.stage}, ${ctx.tasksDone} of ${ctx.tasksOpen + ctx.tasksDone} tasks are done, and ${formatCurrency(ctx.invoicePaid, ctx.currency, ctx.locale)} of ${formatCurrency(ctx.invoiceTotal, ctx.currency, ctx.locale)} has been collected.`,
      mock: true,
    };
  }
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1000,
      system: `You answer questions about a specific service project. Use ONLY the context provided. If something isn't in the context, say so plainly — don't invent. Keep answers concise (2-5 sentences) unless the question demands more depth. When you reference numbers (money, task counts, dates), pull them from the context verbatim.`,
      messages: [{ role: 'user', content: `${contextBlock(ctx)}\n\nQuestion: ${question}` }],
    });
    const answer = (resp.content[0] as { text: string }).text.trim();
    return { answer, mock: false };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'project-ai.ask.failed');
    throw new Error('Could not answer — try again.');
  }
}
