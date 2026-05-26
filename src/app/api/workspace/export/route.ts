/**
 * Backup / export the entire tenant as JSON.
 * Streams a single JSON blob containing every tenant-scoped record + file URLs.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';

export async function GET(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;

  const t = auth.tenant.id;
  const [
    tenant, roles, users, customTables, contacts, leads, pipelines,
    proposals, invoices, payments, signatureRequests, files, galleries,
    documents, chatThreads, messages, calendarEvents, accountingConnections,
    leadForms, scoringRules, dripSequences, projects, portalTemplates,
  ] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: t } }),
    prisma.role.findMany({ where: { tenantId: t } }),
    prisma.user.findMany({ where: { tenantId: t }, select: { id: true, email: true, fullName: true, roleId: true, status: true, createdAt: true } }),
    prisma.customTable.findMany({ where: { tenantId: t }, include: { columns: true, rows: true } }),
    prisma.contact.findMany({ where: { tenantId: t } }),
    prisma.lead.findMany({ where: { tenantId: t } }),
    prisma.pipeline.findMany({ where: { tenantId: t }, include: { stages: true } }),
    prisma.proposal.findMany({ where: { tenantId: t }, include: { versions: true, events: true } }),
    prisma.invoice.findMany({ where: { tenantId: t } }),
    prisma.payment.findMany({ where: { tenantId: t } }),
    prisma.signatureRequest.findMany({ where: { tenantId: t } }),
    prisma.fileObject.findMany({ where: { tenantId: t } }),
    prisma.gallery.findMany({ where: { tenantId: t }, include: { items: true } }),
    prisma.document.findMany({ where: { tenantId: t } }),
    prisma.chatThread.findMany({ where: { tenantId: t } }),
    prisma.message.findMany({ where: { tenantId: t } }),
    prisma.calendarEvent.findMany({ where: { tenantId: t } }),
    prisma.accountingConnection.findMany({ where: { tenantId: t }, select: { id: true, provider: true, status: true, createdAt: true } }),
    prisma.leadForm.findMany({ where: { tenantId: t } }),
    prisma.leadScoringRule.findMany({ where: { tenantId: t } }),
    prisma.dripSequence.findMany({ where: { tenantId: t } }),
    prisma.project.findMany({ where: { tenantId: t } }),
    prisma.portalTemplate.findMany({ where: { tenantId: t } }),
  ]);

  await audit({
    tenantId: t,
    userId: auth.user.id,
    action: 'export',
    entity: 'Tenant',
    entityId: t,
    ip: req.headers.get('x-forwarded-for') ?? undefined,
  });

  const blob = JSON.stringify({
    exportedAt: new Date().toISOString(),
    tenant,
    roles,
    users,
    customTables,
    contacts,
    leads,
    pipelines,
    proposals,
    invoices,
    payments,
    signatureRequests,
    files,
    galleries,
    documents,
    chatThreads,
    messages,
    calendarEvents,
    accountingConnections,
    leadForms,
    scoringRules,
    dripSequences,
    projects,
    portalTemplates,
  }, null, 2);

  return new Response(blob, {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${auth.tenant.slug}-export-${new Date().toISOString().slice(0,10)}.json"`,
    },
  });
}
