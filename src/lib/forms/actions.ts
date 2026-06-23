/**
 * Form-action runtime.
 *
 * A LeadForm.actionsJson is an array like:
 *   [
 *     { type: 'create_lead' },
 *     { type: 'ai_draft_proposal' },
 *     { type: 'book_meeting', props: { meetingTypeSlug: '...' } },
 *     { type: 'enroll_drip', props: { sequenceIds: [...] } },
 *     { type: 'notify_internal' },
 *     { type: 'redirect', props: { url: '...' } },
 *   ]
 *
 * `executeFormActions` iterates this list in order. Each handler is wrapped so
 * one failure doesn't sink the whole chain — we record the error per-action,
 * keep going, and surface the partial result. The submit route writes a
 * FormSubmission row with the full audit trail.
 *
 * Outputs that affect the public form's next step (e.g. an embed slug for the
 * scheduler, a payment link URL) bubble up through the returned `outcome`.
 */
import { prisma } from '../db';
import { logger } from '../logger';
import { enqueue, JOB_NAMES } from '../queue';
import { applyScoringRules } from '../lead-scoring';
import { generateProposal } from '../ai';
import { computeTotals } from '../proposal-schema';
import { createPaymentLink } from '../payments/razorpay';
import { nanoid } from 'nanoid';

/** "FY 2026-27" — Indian financial year format used by the Invoice model. */
function financialYearFor(d: Date): string {
  const month = d.getMonth(); // 0-11
  const year = d.getFullYear();
  const start = month >= 3 ? year : year - 1; // FY starts in April
  return `FY ${start}-${String(start + 1).slice(-2)}`;
}

// ─── public types ─────────────────────────────────────────────────────────────
export interface ActionContext {
  /** Form being submitted. */
  form: {
    id: string;
    name: string;
    slug: string;
    tenantId: string;
    redirectUrl: string | null;
    notifyEmails: unknown;
  };
  /** Tenant for downstream lookups. */
  tenant: {
    id: string;
    name: string;
    currency: string;
    taxRate: number;
    taxLabel: string;
    businessTypeName: string;
  };
  /** Raw submitted body keyed by field name. */
  body: Record<string, string>;
}

export interface ActionOutcome {
  contactId?: string;
  leadId?: string;
  proposalId?: string;
  /** When set, the public form switches to a scheduler step pointing at /book/[slug]. */
  embedMeetingTypeSlug?: string;
  paymentLinkUrl?: string;
  redirectUrl?: string;
}

export interface ActionResult {
  type: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

export interface FormActionSpec {
  type: string;
  props?: Record<string, unknown>;
}

// ─── runtime ──────────────────────────────────────────────────────────────────
const HANDLERS: Record<string, (ctx: ActionContext, props: Record<string, unknown>, outcome: ActionOutcome) => Promise<void>> = {
  create_lead: handleCreateLead,
  create_contact_only: handleCreateContactOnly,
  ai_draft_proposal: handleAiDraftProposal,
  book_meeting: handleBookMeeting,
  send_invoice: handleSendInvoice,
  enroll_drip: handleEnrollDrip,
  notify_internal: handleNotifyInternal,
  redirect: handleRedirect,
};

/** The default chain we run when LeadForm.actionsJson is null (legacy forms). */
export const DEFAULT_ACTIONS: FormActionSpec[] = [
  { type: 'create_lead' },
  { type: 'enroll_drip', props: { trigger: 'lead.created' } },
  { type: 'notify_internal' },
];

export async function executeFormActions(
  ctx: ActionContext,
  actions: FormActionSpec[] | null | undefined,
): Promise<{ outcome: ActionOutcome; results: ActionResult[] }> {
  const list = actions && actions.length > 0 ? actions : DEFAULT_ACTIONS;
  const outcome: ActionOutcome = {};
  const results: ActionResult[] = [];

  for (const spec of list) {
    const handler = HANDLERS[spec.type];
    const started = Date.now();
    if (!handler) {
      results.push({ type: spec.type, ok: false, error: 'Unknown action type', durationMs: 0 });
      continue;
    }
    try {
      await handler(ctx, spec.props ?? {}, outcome);
      results.push({ type: spec.type, ok: true, durationMs: Date.now() - started });
    } catch (e) {
      const msg = (e as Error).message || 'Action failed';
      logger.warn({ err: msg, action: spec.type, formId: ctx.form.id }, 'form.action.failed');
      results.push({ type: spec.type, ok: false, error: msg, durationMs: Date.now() - started });
      // Keep going — partial success is the design.
    }
  }
  return { outcome, results };
}

// ─── handlers ─────────────────────────────────────────────────────────────────
function contactName(body: Record<string, string>): string {
  return body.name ?? body.fullName ?? body.full_name ?? 'Anonymous';
}

async function ensureContact(ctx: ActionContext): Promise<string> {
  const name = contactName(ctx.body);
  const email = ctx.body.email ?? null;
  const phone = ctx.body.phone ?? ctx.body.contact ?? null;

  // De-duplicate on email or phone within the tenant — fixes the H1 issue
  // from the earlier audit (every submission was creating a new contact).
  if (email || phone) {
    const existing = await prisma.contact.findFirst({
      where: {
        tenantId: ctx.form.tenantId,
        OR: [
          email ? { email } : { id: '__no_match__' },
          phone ? { phone } : { id: '__no_match__' },
        ],
      },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  const contact = await prisma.contact.create({
    data: {
      tenantId: ctx.form.tenantId,
      fullName: name,
      email,
      phone,
      source: `form:${ctx.form.slug}`,
      notes: Object.entries(ctx.body).map(([k, v]) => `${k}: ${v}`).join('\n').slice(0, 2000),
    },
    select: { id: true },
  });
  return contact.id;
}

async function handleCreateContactOnly(ctx: ActionContext, _props: object, outcome: ActionOutcome) {
  outcome.contactId = await ensureContact(ctx);
}

async function handleCreateLead(ctx: ActionContext, _props: object, outcome: ActionOutcome) {
  outcome.contactId = outcome.contactId ?? (await ensureContact(ctx));

  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: ctx.form.tenantId, isDefault: true },
    include: { stages: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  if (!pipeline || !pipeline.stages[0]) {
    throw new Error('No default pipeline configured');
  }

  const lead = await prisma.lead.create({
    data: {
      tenantId: ctx.form.tenantId,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0].id,
      contactId: outcome.contactId,
      title: `Lead from ${ctx.form.name}`,
      source: ctx.form.slug,
      notes: ctx.body.message ?? ctx.body.notes ?? null,
    },
  });
  outcome.leadId = lead.id;

  // Score (existing logic).
  const score = await applyScoringRules(ctx.form.tenantId, { ...ctx.body, source: ctx.form.slug });
  if (score > 0) {
    await prisma.lead.update({ where: { id: lead.id }, data: { score } });
  }
}

async function handleAiDraftProposal(ctx: ActionContext, _props: object, outcome: ActionOutcome) {
  // We need a Lead to attach the proposal to. If create_lead hasn't run yet,
  // run it now (idempotent — ensureContact dedupes).
  if (!outcome.leadId) await handleCreateLead(ctx, {}, outcome);

  // Build a brief from the submitted fields. Quote-request forms put the meat
  // in fields like eventType + guestCount + budget + message; we concatenate
  // every non-empty value so the AI has the same view a vendor would.
  const brief = Object.entries(ctx.body)
    .filter(([k, v]) => v && !['name', 'fullName', 'full_name', 'email', 'phone'].includes(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  if (brief.trim().length < 30) {
    // Not enough signal to draft a meaningful proposal — skip silently.
    logger.info({ formId: ctx.form.id }, 'ai_draft_proposal.skipped.thin-brief');
    return;
  }

  const doc = await generateProposal({
    tenantId: ctx.tenant.id,
    brief,
    clientName: contactName(ctx.body),
    vendorName: ctx.tenant.name,
    vendorBusinessType: ctx.tenant.businessTypeName,
    taxRate: ctx.tenant.taxRate,
    taxLabel: ctx.tenant.taxLabel,
    currency: ctx.tenant.currency,
  });
  const totals = computeTotals(doc);

  // Proposal.createdById is required — public form has no logged-in user, so
  // attribute the draft to the tenant owner (earliest-created Admin user).
  const owner = await prisma.user.findFirst({
    where: { tenantId: ctx.form.tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!owner) {
    throw new Error('No owner user to attribute AI-drafted proposal to');
  }

  const proposal = await prisma.proposal.create({
    data: {
      tenantId: ctx.form.tenantId,
      createdById: owner.id,
      leadId: outcome.leadId,
      contactId: outcome.contactId,
      title: doc.title || `Draft for ${contactName(ctx.body)}`,
      brief: brief.slice(0, 2000),
      clientName: contactName(ctx.body),
      clientEmail: ctx.body.email ?? null,
      contentJson: doc as object,
      total: totals.total,
      status: 'DRAFT',
      shareToken: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
    },
  });
  outcome.proposalId = proposal.id;
}

async function handleBookMeeting(ctx: ActionContext, props: Record<string, unknown>, outcome: ActionOutcome) {
  // Resolve which meeting type to embed:
  //   1. props.meetingTypeSlug if the vendor configured it
  //   2. else the tenant's first active meeting type
  let slug = typeof props.meetingTypeSlug === 'string' ? props.meetingTypeSlug : null;
  if (!slug) {
    const mt = await prisma.meetingType.findFirst({
      where: { tenantId: ctx.form.tenantId, active: true, archived: false },
      select: { slug: true },
      orderBy: { createdAt: 'asc' },
    });
    slug = mt?.slug ?? null;
  }
  if (!slug) {
    throw new Error('No active meeting type configured for booking');
  }
  outcome.embedMeetingTypeSlug = slug;
}

async function handleEnrollDrip(ctx: ActionContext, props: Record<string, unknown>, outcome: ActionOutcome) {
  if (!outcome.contactId) return;
  // Either a specific list of sequence IDs (vendor-configured) or all matching
  // sequences with the given trigger (default).
  const sequenceIds = Array.isArray(props.sequenceIds) ? (props.sequenceIds as string[]) : null;
  const trigger = typeof props.trigger === 'string' ? props.trigger : 'lead.created';

  const seqs = sequenceIds
    ? await prisma.dripSequence.findMany({
        where: { tenantId: ctx.form.tenantId, id: { in: sequenceIds }, active: true },
      })
    : await prisma.dripSequence.findMany({
        where: { tenantId: ctx.form.tenantId, trigger, active: true },
      });

  for (const seq of seqs) {
    const enrollment = await prisma.dripEnrollment.create({
      data: { tenantId: ctx.form.tenantId, sequenceId: seq.id, contactId: outcome.contactId, status: 'ACTIVE' },
    });
    const steps = (seq.stepsJson as unknown as { delayHours: number }[]) ?? [];
    if (steps[0]) {
      await enqueue(JOB_NAMES.DRIP_STEP, { enrollmentId: enrollment.id, stepIdx: 0 }, {
        delay: steps[0].delayHours * 60 * 60 * 1000,
      });
    }
  }
}

async function handleNotifyInternal(ctx: ActionContext, _props: object, _outcome: ActionOutcome) {
  await prisma.notification.create({
    data: {
      tenantId: ctx.form.tenantId,
      type: 'lead.new',
      title: `New lead from ${ctx.form.name}`,
      body: `${contactName(ctx.body)}${ctx.body.email ? ` · ${ctx.body.email}` : ''}`,
      href: '/app/leads',
    },
  });
}

async function handleRedirect(_ctx: ActionContext, props: Record<string, unknown>, outcome: ActionOutcome) {
  const url = typeof props.url === 'string' ? props.url : null;
  if (url) outcome.redirectUrl = url;
}

/**
 * Charge a deposit / fixed-fee for the form submission via the tenant's
 * Razorpay account. Used by Instant-booking + paid-consultation flows.
 *
 * Props:
 *   - amount (rupees, required)
 *   - description (optional)
 *   - lineItemName (optional, defaults to "Booking deposit")
 *
 * Side effects:
 *   - Creates a draft Invoice + pending Payment row tied to the lead
 *   - Returns paymentLinkUrl through the outcome so the public form can
 *     redirect the visitor to Razorpay checkout.
 */
async function handleSendInvoice(ctx: ActionContext, props: Record<string, unknown>, outcome: ActionOutcome) {
  const amount = typeof props.amount === 'number' && props.amount > 0
    ? props.amount
    : Number(props.amount);
  if (!amount || Number.isNaN(amount)) {
    throw new Error('send_invoice: amount (in rupees) is required');
  }
  // We need a contact to bill, plus the lead to attach the invoice to.
  if (!outcome.contactId) await handleCreateContactOnly(ctx, {}, outcome);
  if (!outcome.leadId) await handleCreateLead(ctx, {}, outcome);

  const lineItemName = typeof props.lineItemName === 'string' ? props.lineItemName : 'Booking deposit';
  const description = typeof props.description === 'string' ? props.description : `${ctx.form.name} — ${lineItemName}`;

  // Create a minimal invoice. We don't attach a lead here (the model has no
  // direct lead FK) — the matched FormSubmission row preserves the link.
  const fy = financialYearFor(new Date());
  const invoice = await prisma.invoice.create({
    data: {
      tenantId: ctx.form.tenantId,
      contactId: outcome.contactId,
      number: `FORM-${nanoid(8).toUpperCase()}`,
      series: 'INV',
      financialYear: fy,
      status: 'SENT',
      total: amount,
      subtotal: amount,
      amountPaid: 0,
      issueDate: new Date(),
      placeOfSupply: 'IN-DL',
      shareToken: nanoid(24),
      contentJson: {
        lineItems: [{ name: lineItemName, hsn: '999799', quantity: 1, unitPrice: amount, amount }],
      } as object,
    },
    select: { id: true, number: true, tenantId: true, shareToken: true },
  });

  const payment = await prisma.payment.create({
    data: {
      tenantId: ctx.form.tenantId,
      invoiceId: invoice.id,
      amount,
      method: 'UPI',
      status: 'PENDING',
      provider: 'razorpay',
    },
    select: { id: true },
  });

  const link = await createPaymentLink({
    amountInRupees: amount,
    description,
    reference: `${payment.id}-${Date.now()}`,
    customer: {
      name: contactName(ctx.body),
      email: ctx.body.email ?? undefined,
      phone: ctx.body.phone ?? undefined,
    },
    callbackUrl: `${process.env.APP_URL ?? ''}/i/${invoice.shareToken}?paid=1`,
    notes: { reference_id: payment.id, invoiceId: invoice.id, tenantId: ctx.form.tenantId },
  }, ctx.form.tenantId);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerOrderId: link.providerOrderId },
  });
  outcome.paymentLinkUrl = link.shortUrl;
}
