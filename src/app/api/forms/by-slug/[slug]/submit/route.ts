/**
 * Public submit endpoint.
 *
 * Refactored in Phase 2 to dispatch to the action-chain runtime. Behaviour for
 * legacy forms (actionsJson null) is preserved via DEFAULT_ACTIONS in
 * lib/forms/actions.ts.
 *
 * Response shape lets /f/[slug] know what to render next:
 *   { ok, redirectUrl?, embedMeetingTypeSlug?, paymentLinkUrl? }
 */
import { NextResponse } from 'next/server';
import { checkBotId } from 'botid/server';
import { prisma } from '@/lib/db';
import { enforceRateLimit } from '@/lib/api';
import {
  executeFormActions,
  type FormActionSpec,
  type ActionContext,
} from '@/lib/forms/actions';
import { logger } from '@/lib/logger';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blocked = await enforceRateLimit(req, { keyPrefix: `form.${slug}`, limit: 20, windowMs: 60_000 });
  if (blocked) return blocked;

  // Vercel BotID classification (log-only by default).
  //
  // We intentionally DO NOT drop on isBot=true unless BOTID_ENFORCE=true is
  // set. Reason: BotID requires the client-side <BotIdClient /> component to
  // mint a token in the browser; without it every server-side checkBotId()
  // returns isBot: true and silently drops legitimate users. Enforcement
  // ships once we wire the client component on /f/[slug] and /book/[slug].
  try {
    const verdict = await checkBotId();
    if (verdict.isBot) {
      logger.warn({ slug, reason: 'botid' }, 'form.submit.bot-flagged');
      if (process.env.BOTID_ENFORCE === 'true') {
        return NextResponse.json({ ok: true });
      }
    }
  } catch {
    // BotID not configured — fall through; rate limit still applies.
  }

  const form = await prisma.leadForm.findUnique({
    where: { slug },
    include: { tenant: { include: { businessType: { select: { name: true } } } } },
  });
  if (!form || !form.active) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const ctx: ActionContext = {
    form: {
      id: form.id,
      name: form.name,
      slug: form.slug,
      tenantId: form.tenantId,
      redirectUrl: form.redirectUrl,
      notifyEmails: form.notifyEmails,
    },
    tenant: {
      id: form.tenantId,
      name: form.tenant.name,
      currency: form.tenant.currency,
      taxRate: form.tenant.taxRate,
      taxLabel: form.tenant.taxLabel,
      businessTypeName: form.tenant.businessType.name,
    },
    body,
  };

  const actions = (form.actionsJson as FormActionSpec[] | null) ?? null;
  const { outcome, results } = await executeFormActions(ctx, actions);

  // Audit row — always written even when some actions failed.
  await prisma.formSubmission.create({
    data: {
      tenantId: form.tenantId,
      formId: form.id,
      payloadJson: body as object,
      contactId: outcome.contactId ?? null,
      leadId: outcome.leadId ?? null,
      proposalId: outcome.proposalId ?? null,
      actionResultsJson: results as object,
    },
  }).catch((e) => logger.warn({ err: (e as Error).message }, 'form.submission.audit.failed'));

  return NextResponse.json({
    ok: true,
    redirectUrl: outcome.redirectUrl ?? form.redirectUrl,
    embedMeetingTypeSlug: outcome.embedMeetingTypeSlug ?? null,
    paymentLinkUrl: outcome.paymentLinkUrl ?? null,
    actionResults: results,
  });
}
