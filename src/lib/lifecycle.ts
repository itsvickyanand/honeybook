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
import { pushEventToGoogle } from './calendar/google';
import type { ParsedBrief } from './ai/types';

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

  // 7. Auto-create a CalendarEvent for the event date + push to Google when connected.
  if (proposalId) {
    try { await createBookingFromPaidProposal(invoice.tenantId, proposalId); }
    catch (e) { logger.warn({ err: (e as Error).message, proposalId }, 'lifecycle.booking.failed'); }
  }

  // 8. Auto-create a Project (the post-booking workspace) and seed Tasks from
  //    the BusinessType template. Idempotent: if a Project already exists for
  //    this proposal, this is a no-op.
  if (proposalId) {
    try {
      const project = await ensureProjectForProposal(invoice.tenantId, proposalId);
      if (project) {
        await seedTasksFromTemplate(invoice.tenantId, project.id);
        // Update Invoice + Proposal back-links so the Project becomes the canonical hub
        await prisma.invoice.update({ where: { id: invoice.id }, data: { projectId: project.id } });
        await prisma.proposal.update({ where: { id: proposalId }, data: { projectId: project.id } });
        await dispatchNotification({
          tenantId: invoice.tenantId,
          type: 'project.created',
          title: `Project created: ${project.name}`,
          body: 'Tasks have been seeded from the template. Review and assign owners.',
          href: `/app/projects/${project.id}`,
        });
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message, proposalId }, 'lifecycle.project-autocreate.failed');
    }
  }
}

/**
 * Idempotently create a Project tied to a Proposal.
 * If the proposal already has projectId, returns the existing project.
 * Pulls totalValue from the proposal, dates from parsed brief (eventDates).
 */
export async function ensureProjectForProposal(
  tenantId: string,
  proposalId: string
): Promise<{ id: string; name: string; tenantId: string; startDate: Date | null } | null> {
  const existing = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      project: { select: { id: true, name: true, tenantId: true, startDate: true } },
    },
  });
  if (!existing) return null;
  if (existing.project) return existing.project;

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { contact: true, tenant: { select: { businessType: { select: { slug: true } } } } },
  });
  if (!proposal) return null;

  const parsed = (proposal.parsedBrief ?? {}) as ParsedBrief;
  let startDate: Date | null = null;
  if (parsed.eventDates?.length) {
    const d = new Date(parsed.eventDates[0]);
    if (!isNaN(d.getTime())) startDate = d;
  }
  const endDate = startDate ? new Date(startDate.getTime() + 86400_000) : null;

  const lead = await findLeadForProposal(proposalId);

  const name =
    proposal.contact?.fullName
      ? `${proposal.contact.fullName} — ${proposal.title}`
      : proposal.title;

  const project = await prisma.project.create({
    data: {
      tenantId,
      contactId: proposal.contactId ?? undefined,
      leadId: lead?.id ?? undefined,
      name,
      description: proposal.brief.slice(0, 1000),
      startDate,
      endDate,
      totalValue: proposal.total,
      status: 'CONFIRMED',
      stage: 'new',
      templateSlug: proposal.tenant.businessType.slug,
      sourceProposalId: proposal.id,
    },
  });

  return { id: project.id, name: project.name, tenantId: project.tenantId, startDate: project.startDate };
}

/**
 * Create a Project from a Lead WITHOUT requiring payment — lets a vendor start
 * delivery as soon as a deal is verbally won. Reuses any proposal already on
 * the lead (so the project links the proposal + inherits its value); otherwise
 * builds the project from the lead/contact directly. Idempotent: if a project
 * already exists for the lead (or its proposal) it's returned, not duplicated.
 */
export async function ensureProjectForLead(
  tenantId: string,
  leadId: string
): Promise<{ id: string; name: string; created: boolean } | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    include: {
      contact: true,
      proposals: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  });
  if (!lead) return null;

  // Already-linked project for this lead?
  const existing = await prisma.project.findFirst({ where: { tenantId, leadId }, select: { id: true, name: true } });
  if (existing) return { ...existing, created: false };

  // If the lead has a proposal, route through the proposal path (links it).
  const proposal = lead.proposals[0];
  if (proposal) {
    const p = await ensureProjectForProposal(tenantId, proposal.id);
    if (p) {
      await seedTasksFromTemplate(tenantId, p.id);
      await prisma.proposal.update({ where: { id: proposal.id }, data: { projectId: p.id } }).catch(() => {});
      return { id: p.id, name: p.name, created: true };
    }
  }

  // No proposal — build directly from the lead.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { businessType: { select: { slug: true } } },
  });
  const name = lead.contact?.fullName ? `${lead.contact.fullName} — ${lead.title}` : lead.title;
  const project = await prisma.project.create({
    data: {
      tenantId,
      contactId: lead.contactId ?? undefined,
      leadId: lead.id,
      name,
      description: lead.notes ?? undefined,
      totalValue: lead.value,
      status: 'CONFIRMED',
      stage: 'new',
      templateSlug: tenant?.businessType.slug ?? undefined,
    },
  });
  await seedTasksFromTemplate(tenantId, project.id);
  return { id: project.id, name: project.name, created: true };
}

interface TaskTemplateEntry {
  key: string;
  title: string;
  description?: string;
  category?: 'PREP' | 'COMMUNICATION' | 'DELIVERY' | 'ADMIN' | 'FOLLOWUP';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';
  dueOffsetDays: number;
  reminderHoursBefore?: number;
}

/**
 * Seed Tasks from the BusinessType template for a freshly created Project.
 * Idempotent on (projectId, templateKey) — won't duplicate if rerun.
 */
export async function seedTasksFromTemplate(tenantId: string, projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tenant: { include: { businessType: true } },
    },
  });
  if (!project) return 0;

  const tpl = project.tenant.businessType.templateJson as
    | { taskTemplates?: TaskTemplateEntry[] }
    | null;
  const entries = tpl?.taskTemplates ?? [];
  if (entries.length === 0) return 0;

  // Anchor for offsets: project.startDate if set, otherwise +30d from now
  const anchor =
    project.startDate ?? new Date(Date.now() + 30 * 86400_000);

  const existing = await prisma.task.findMany({
    where: { projectId, templateKey: { in: entries.map((e) => e.key) } },
    select: { templateKey: true },
  });
  const have = new Set(existing.map((t) => t.templateKey));

  let created = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (have.has(e.key)) continue;
    const dueDate = new Date(anchor.getTime() + e.dueOffsetDays * 86400_000);
    await prisma.task.create({
      data: {
        tenantId,
        projectId,
        title: e.title,
        description: e.description,
        category: e.category ?? 'PREP',
        priority: e.priority ?? 'MEDIUM',
        status: 'TODO',
        dueDate,
        sortOrder: i,
        templateKey: e.key,
        dueOffsetDays: e.dueOffsetDays,
        reminderHoursBefore: e.reminderHoursBefore,
      },
    });
    created++;
  }
  return created;
}

async function createBookingFromPaidProposal(tenantId: string, proposalId: string) {
  // Don't create duplicates
  const existing = await prisma.calendarEvent.findFirst({
    where: { tenantId, type: 'BOOKING', meta: { path: ['proposalId'], equals: proposalId } as object },
  });
  if (existing) return;

  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { contact: true },
  });
  if (!proposal) return;

  const parsed = (proposal.parsedBrief ?? {}) as ParsedBrief;
  let startAt: Date | null = null;
  if (parsed.eventDates?.length) {
    const d = new Date(parsed.eventDates[0]);
    if (!isNaN(d.getTime())) startAt = d;
  }
  if (!startAt) {
    startAt = new Date(Date.now() + 30 * 86400_000);
    startAt.setHours(10, 0, 0, 0);
  }
  const endAt = new Date(startAt.getTime() + 8 * 60 * 60 * 1000);

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId,
      title: `${proposal.contact?.fullName ?? proposal.clientName ?? 'Event'} — ${proposal.title}`,
      description: proposal.brief.slice(0, 500),
      startAt,
      endAt,
      allDay: true,
      type: 'BOOKING',
      location: parsed.city ?? undefined,
      meta: { proposalId: proposal.id, source: 'invoice-paid' } as object,
    },
  });

  try {
    const externalId = await pushEventToGoogle(tenantId, {
      title: event.title,
      description: event.description ?? undefined,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location ?? undefined,
      allDay: event.allDay,
    });
    if (externalId) {
      await prisma.calendarEvent.update({ where: { id: event.id }, data: { externalId } });
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message, eventId: event.id }, 'calendar.google.push-failed');
  }
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
