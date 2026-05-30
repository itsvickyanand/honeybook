/**
 * One-off production cleanup (reviewed plan).
 *  - DELETE entirely: every tenant whose name does NOT start with "Demo "
 *    (RLS Test, test, Smoke Test, Consent Co, Habibi events) → cascades rows+users.
 *  - For each "Demo " tenant: wipe transactional/stale data, KEEP tenant +
 *    catalog (CustomTable/Row) + roles + team + pipeline + integrations + ALL users.
 *    Reset InvoiceSequence so numbering restarts at /00001.
 *
 * Run: DATABASE_URL=<neon> node scripts/cleanup-stale.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function step(label, fn) {
  try {
    const r = await fn();
    const n = typeof r?.count === 'number' ? r.count : (Array.isArray(r) ? r.length : '');
    console.log(`   ✓ ${label} ${n !== '' ? '(' + n + ')' : ''}`);
  } catch (e) {
    console.log(`   ✗ ${label} — ${e.message.split('\n')[0]}`);
  }
}

async function wipeTenant(t) {
  const tenantId = t.id;
  console.log(`\n▶ Wiping transactional data: ${t.name}`);
  // 1) Break cross/self references so parent deletes don't hit RESTRICT.
  await step('null Invoice refs', () => p.invoice.updateMany({ where: { tenantId }, data: { proposalId: null, projectId: null, scheduleItemId: null, voidOfId: null } }));
  await step('null Payment.mandateId', () => p.payment.updateMany({ where: { tenantId }, data: { mandateId: null } }));
  await step('null Proposal refs', () => p.proposal.updateMany({ where: { tenantId }, data: { leadId: null, contactId: null, projectId: null } }));
  await step('null Project refs', () => p.project.updateMany({ where: { tenantId }, data: { contactId: null, leadId: null, teamId: null, ownerId: null } }));
  await step('null Lead.contactId', () => p.lead.updateMany({ where: { tenantId }, data: { contactId: null } }));
  await step('null Document.proposalId', () => p.document.updateMany({ where: { tenantId }, data: { proposalId: null } }));

  // 2) Delete children → parents (FK-safe order).
  await step('PaymentWebhook', () => p.paymentWebhook.deleteMany({ where: { payment: { tenantId } } }));
  await step('Payment', () => p.payment.deleteMany({ where: { tenantId } }));
  await step('Mandate', () => p.mandate.deleteMany({ where: { tenantId } }));
  await step('PaymentScheduleItem', () => p.paymentScheduleItem.deleteMany({ where: { schedule: { tenantId } } }));
  await step('PaymentSchedule', () => p.paymentSchedule.deleteMany({ where: { tenantId } }));
  await step('Invoice', () => p.invoice.deleteMany({ where: { tenantId } }));
  await step('SignatureRequest', () => p.signatureRequest.deleteMany({ where: { proposal: { tenantId } } }));
  await step('ProposalEvent', () => p.proposalEvent.deleteMany({ where: { proposal: { tenantId } } }));
  await step('ProposalVersion', () => p.proposalVersion.deleteMany({ where: { proposal: { tenantId } } }));
  await step('Document', () => p.document.deleteMany({ where: { tenantId } }));
  await step('Review', () => p.review.deleteMany({ where: { tenantId } }));
  await step('Task', () => p.task.deleteMany({ where: { tenantId } }));
  await step('ProjectMember', () => p.projectMember.deleteMany({ where: { project: { tenantId } } }));
  await step('Activity', () => p.activity.deleteMany({ where: { tenantId } }));
  await step('Proposal', () => p.proposal.deleteMany({ where: { tenantId } }));
  await step('Project', () => p.project.deleteMany({ where: { tenantId } }));
  await step('Lead', () => p.lead.deleteMany({ where: { tenantId } }));
  await step('GalleryItem', () => p.galleryItem.deleteMany({ where: { gallery: { tenantId } } }));
  await step('Gallery', () => p.gallery.deleteMany({ where: { tenantId } }));
  await step('Message', () => p.message.deleteMany({ where: { tenantId } }));
  await step('ChatThread', () => p.chatThread.deleteMany({ where: { tenantId } }));
  await step('Notification', () => p.notification.deleteMany({ where: { tenantId } }));
  await step('UserInvite', () => p.userInvite.deleteMany({ where: { tenantId } }));
  await step('AuditLog', () => p.auditLog.deleteMany({ where: { tenantId } }));
  await step('DripEnrollment', () => p.dripEnrollment.deleteMany({ where: { tenantId } }));
  await step('Contact', () => p.contact.deleteMany({ where: { tenantId } }));
  await step('FileObject', () => p.fileObject.deleteMany({ where: { tenantId } }));
  // 3) Restart invoice numbering.
  await step('reset InvoiceSequence', () => p.invoiceSequence.updateMany({ where: { tenantId }, data: { counter: 0 } }));
}

async function deleteTenant(t) {
  console.log(`\n✗ Deleting tenant entirely: ${t.name}`);
  // Non-cascading FKs first (mirrors seed teardown).
  await step('GalleryItem', () => p.galleryItem.deleteMany({ where: { gallery: { tenantId: t.id } } }));
  await step('UserInvite', () => p.userInvite.deleteMany({ where: { tenantId: t.id } }));
  await step('Tenant.delete (cascade)', () => p.tenant.delete({ where: { id: t.id } }));
}

async function counts() {
  const tenants = await p.tenant.count();
  const users = await p.user.count();
  const proposals = await p.proposal.count();
  const invoices = await p.invoice.count();
  const payments = await p.payment.count();
  const leads = await p.lead.count();
  const projects = await p.project.count();
  const contacts = await p.contact.count();
  return { tenants, users, proposals, invoices, payments, leads, projects, contacts };
}

(async () => {
  console.log('BEFORE:', JSON.stringify(await counts()));
  const tenants = await p.tenant.findMany({ select: { id: true, name: true } });
  const keep = tenants.filter((t) => t.name.startsWith('Demo '));
  const drop = tenants.filter((t) => !t.name.startsWith('Demo '));
  console.log(`\nKEEP (${keep.length}):`, keep.map((t) => t.name).join(', '));
  console.log(`DROP (${drop.length}):`, drop.map((t) => t.name).join(', '));

  for (const t of drop) await deleteTenant(t);
  for (const t of keep) await wipeTenant(t);

  console.log('\nAFTER:', JSON.stringify(await counts()));
  console.log('\nPer kept tenant:');
  for (const t of keep) {
    const [props, invs, pays, leads, projs, contacts, ct, cr, roles, usersN] = await Promise.all([
      p.proposal.count({ where: { tenantId: t.id } }),
      p.invoice.count({ where: { tenantId: t.id } }),
      p.payment.count({ where: { tenantId: t.id } }),
      p.lead.count({ where: { tenantId: t.id } }),
      p.project.count({ where: { tenantId: t.id } }),
      p.contact.count({ where: { tenantId: t.id } }),
      p.customTable.count({ where: { tenantId: t.id } }),
      p.customRow.count({ where: { table: { tenantId: t.id } } }),
      p.role.count({ where: { tenantId: t.id } }),
      p.user.count({ where: { tenantId: t.id } }),
    ]);
    console.log(`  ${t.name}: props ${props} inv ${invs} pay ${pays} leads ${leads} proj ${projs} contacts ${contacts} | KEPT catalogTables ${ct} catalogRows ${cr} roles ${roles} users ${usersN}`);
  }
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
