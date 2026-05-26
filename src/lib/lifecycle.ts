/**
 * Domain lifecycle helpers — small, composable functions that fan out
 * side-effects when business events happen.
 *
 * Used by:
 *   - worker handlers (payment.reconcile, etc.)
 *   - API routes that change proposal/invoice/lead state
 *
 * Each helper is best-effort: a failure in one fan-out should not block
 * the primary state change. Errors are logged via the logger.
 */
import { prisma } from './db';
import { logger } from './logger';
import { enqueue, JOB_NAMES } from './queue';
import { audit } from './audit';
import { emailPaymentReceived } from './comms/templates';

/**
 * Look up the Lead linked to a Proposal — prefer direct `leadId` link,
 * fall back to picking the most recent open lead by `contactId`.
 */
export async function findLeadForProposal(proposalId: string) {
  const p = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { tenantId: true, leadId: true, contactId: true },
  });
  if (!p) return null;
  if (p.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: p.leadId } });
    if (lead) return lead;
  }
  if (p.contactId) {
    return prisma.lead.findFirst({
      where: { tenantId: p.tenantId, contactId: p.contactId },
      orderBy: { createdAt: 'desc' },
    });
  }
  return null;
}

/**
 * Move a lead to a stage identified by name (case-insensitive).
 * Logs an Activity row of type STAGE_CHANGE.
 */
export async function advanceLeadToStage(
  leadId: string,
  stageName: string,
  reason: string
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { pipeline: { include: { stages: true } } },
  });
  if (!lead) return false;
  const target = lead.pipeline.stages.find(
    (s) => s.name.toLowerCase() === stageName.toLowerCase()
  );
  if (!target) {
    logger.warn({ leadId, stageName }, 'lifecycle.advance.stage-missing');
    return false;
  }
  if (lead.stageId === target.id) return true; // already there

  await prisma.lead.update({
    where: { id: lead.id },
    data: { stageId: target.id },
  });
  await prisma.activity.create({
    data: {
      tenantId: lead.tenantId,
      leadId: lead.id,
      contactId: lead.contactId ?? undefined,
      type: 'STAGE_CHANGE',
      title: `Auto-advanced to ${target.name}`,
      body: reason,
      meta: { fromStageId: lead.stageId, toStageId: target.id } as object,
    },
  });
  logger.info({ leadId, from: lead.stageId, to: target.id, stageName }, 'lifecycle.advance');
  return true;
}

/**
 * Create an Activity row on a Contact (and optionally a Lead).
 */
export async function logActivity(args: {
  tenantId: string;
  contactId?: string | null;
  leadId?: string | null;
  type: string;
  title: string;
  body?: string;
  meta?: object;
}) {
  try {
    await prisma.activity.create({
      data: {
        tenantId: args.tenantId,
        contactId: args.contactId ?? undefined,
        leadId: args.leadId ?? undefined,
        type: args.type,
        title: args.title,
        body: args.body,
        meta: args.meta,
      },
    });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'lifecycle.activity.failed');
  }
}

/**
 * Fan-out for proposal-state transitions.
 * Called from /api/proposals/[id] PATCH after status is changed.
 */
export async function onProposalStatusChanged(
  proposalId: string,
  newStatus: string,
  oldStatus: string
) {
  if (newStatus === oldStatus) return;
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { tenant: { select: { currency: true } } },
  });
  if (!proposal) return;
  const currency = proposal.tenant.currency;

  const lead = await findLeadForProposal(proposalId);

  // Stage advancement
  if (lead) {
    if (newStatus === 'SENT' || newStatus === 'VIEWED') {
      await advanceLeadToStage(lead.id, 'Proposal Sent', `Proposal "${proposal.title}" ${newStatus.toLowerCase()}`);
    } else if (newStatus === 'CHANGES_REQUESTED') {
      await advanceLeadToStage(lead.id, 'Negotiation', `Client requested changes on "${proposal.title}"`);
    } else if (newStatus === 'ACCEPTED') {
      await advanceLeadToStage(lead.id, 'Negotiation', `Proposal "${proposal.title}" accepted — awaiting payment`);
    } else if (newStatus === 'DECLINED') {
      await advanceLeadToStage(lead.id, 'Lost', `Proposal "${proposal.title}" declined`);
    }
  }

  // Activity log on the contact regardless of lead linkage
  if (newStatus === 'ACCEPTED') {
    await logActivity({
      tenantId: proposal.tenantId,
      contactId: proposal.contactId,
      leadId: lead?.id ?? null,
      type: 'PROPOSAL_ACCEPTED',
      title: `Proposal accepted: ${proposal.title}`,
    });
    await dispatchNotification({
      tenantId: proposal.tenantId,
      type: 'proposal.accepted',
      title: `Proposal accepted: ${proposal.title}`,
      body: `Worth ${currency} ${proposal.total.toLocaleString('en-IN')}`,
      href: `/app/proposals/${proposal.id}`,
    });
  } else if (newStatus === 'DECLINED') {
    await logActivity({
      tenantId: proposal.tenantId,
      contactId: proposal.contactId,
      leadId: lead?.id ?? null,
      type: 'PROPOSAL_DECLINED',
      title: `Proposal declined: ${proposal.title}`,
    });
  } else if (newStatus === 'SENT') {
    await logActivity({
      tenantId: proposal.tenantId,
      contactId: proposal.contactId,
      leadId: lead?.id ?? null,
      type: 'PROPOSAL_SENT',
      title: `Proposal sent: ${proposal.title}`,
    });
  }
}

/**
 * Fan-out for an invoice that just flipped to PAID.
 * Called from worker `payment.reconcile` after invoice is updated.
 */
export async function onInvoicePaid(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: true, proposal: true },
  });
  if (!invoice) return;
  const proposalId = invoice.proposalId;
  const proposal = invoice.proposal;
  const lead = proposalId ? await findLeadForProposal(proposalId) : null;

  // 1. Move lead to Won
  if (lead) {
    await advanceLeadToStage(lead.id, 'Won', `Invoice ${invoice.number} fully paid`);
  }

  // 2. Activity timeline
  await logActivity({
    tenantId: invoice.tenantId,
    contactId: invoice.contactId,
    leadId: lead?.id ?? null,
    type: 'PAYMENT_RECEIVED',
    title: `Payment received · ${invoice.tenant.currency} ${invoice.total.toLocaleString('en-IN')}`,
    body: `Invoice ${invoice.number ?? '—'}`,
    meta: { invoiceId: invoice.id, proposalId },
  });

  // 3. Notification bell (no userId → tenant-wide)
  await dispatchNotification({
    tenantId: invoice.tenantId,
    type: 'payment.received',
    title: `Payment received · ${invoice.tenant.currency} ${invoice.total.toLocaleString('en-IN')}`,
    body: `From ${proposal?.clientName ?? 'client'} for ${invoice.number ?? 'invoice'}`,
    href: `/app/invoices/${invoice.id}`,
  });

  // 4. Receipt email to client (async via worker queue)
  if (proposal?.clientEmail) {
    const tmpl = {
      ...emailPaymentReceived({
        clientName: proposal.clientName ?? 'there',
        vendorName: invoice.tenant.name,
        amount: invoice.total,
        currency: invoice.tenant.currency,
        locale: invoice.tenant.locale,
        invoiceNumber: invoice.number ?? '—',
      }),
    };
    await enqueue(JOB_NAMES.EMAIL_SEND, { to: proposal.clientEmail, ...tmpl });
  }

  // 5. Push to accounting if connected
  const acct = await prisma.accountingConnection.findFirst({
    where: { tenantId: invoice.tenantId, status: 'CONNECTED' },
  });
  if (acct) {
    await enqueue(JOB_NAMES.ACCOUNTING_PUSH, {
      tenantId: invoice.tenantId,
      provider: acct.provider,
      entityType: 'invoice',
      entityId: invoice.id,
    });
  }

  // 6. Audit log
  await audit({
    tenantId: invoice.tenantId,
    action: 'pay',
    entity: 'Invoice',
    entityId: invoice.id,
    diff: { status: 'PAID', amountPaid: invoice.amountPaid } as object,
  });
}

/**
 * Wrapper for the notification.dispatch enqueue + immediate in-app row.
 * The in-app row is written synchronously so the bell updates without
 * waiting on the worker.
 */
export async function dispatchNotification(args: {
  tenantId: string;
  userId?: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
}) {
  try {
    await prisma.notification.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        type: args.type,
        title: args.title,
        body: args.body,
        href: args.href,
      },
    });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'lifecycle.notification.failed');
  }
}
