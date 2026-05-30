/**
 * Seed: business types + one demo tenant per type.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BUSINESS_TEMPLATES, BusinessTemplate } from './business-templates';

const prisma = new PrismaClient();

/**
 * Backfill the standard role set onto EVERY existing tenant so older tenants
 * pick up the new Admin/Manager roles + expanded permissions. Idempotent via
 * the unique (tenantId, name) constraint.
 */
async function backfillStandardRoles() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  // All standard roles are identical across business types — read from the
  // first template's role list.
  const roles = BUSINESS_TEMPLATES[0].roles;
  let updated = 0;
  for (const t of tenants) {
    for (const r of roles) {
      await prisma.role.upsert({
        where: { tenantId_name: { tenantId: t.id, name: r.name } },
        update: { description: r.description, permissions: r.permissions as object, isSystem: true },
        create: { tenantId: t.id, name: r.name, description: r.description, permissions: r.permissions as object, isSystem: true },
      });
      updated++;
    }
  }
  return { tenants: tenants.length, rolesUpserted: updated };
}

async function upsertBusinessTypes() {
  const created = [];
  for (const t of BUSINESS_TEMPLATES) {
    const rec = await prisma.businessType.upsert({
      where: { slug: t.slug },
      update: {
        name: t.name,
        description: t.description,
        icon: t.icon,
        accentColor: t.accentColor,
        templateJson: { tables: t.tables, roles: t.roles, taskTemplates: t.taskTemplates ?? [] } as object,
      },
      create: {
        slug: t.slug,
        name: t.name,
        description: t.description,
        icon: t.icon,
        accentColor: t.accentColor,
        templateJson: { tables: t.tables, roles: t.roles, taskTemplates: t.taskTemplates ?? [] } as object,
      },
    });
    created.push(rec);
  }
  return created;
}

async function seedDemoTenant(template: BusinessTemplate, businessTypeId: string) {
  const tenantSlug = `demo-${template.slug}`;
  const tenantName = `Demo ${template.name}`;
  const ownerEmail = `owner@${template.slug}.demo`;
  const password = 'demo1234';
  const passwordHash = await bcrypt.hash(password, 10);

  // FK-safe reset: GalleryItem.fileId → FileObject has no cascade, so a plain
  // tenant delete fails if any gallery items exist (e.g. uploaded test images).
  // Clear gallery items first, then the tenant cascade handles the rest.
  const prior = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
  if (prior) {
    // Clear rows whose FKs don't cascade from Tenant (gallery items → files;
    // user invites → invitedBy user), then the tenant cascade handles the rest.
    await prisma.galleryItem.deleteMany({ where: { gallery: { tenantId: prior.id } } });
    await prisma.userInvite.deleteMany({ where: { tenantId: prior.id } });
    await prisma.tenant.delete({ where: { id: prior.id } });
  }

  const tenant = await prisma.tenant.create({
    data: {
      slug: tenantSlug,
      name: tenantName,
      businessTypeId,
      brandColor: template.accentColor,
    },
  });

  // Default AI config
  await prisma.tenantAIConfig.create({
    data: { tenantId: tenant.id },
  });

  // Default pipeline + stages
  const pipeline = await prisma.pipeline.create({
    data: { tenantId: tenant.id, name: 'Sales Pipeline', isDefault: true },
  });
  const defaultStages = [
    { name: 'New', sortOrder: 0, color: '#64748b' },
    { name: 'Contacted', sortOrder: 1, color: '#3b82f6' },
    { name: 'Qualified', sortOrder: 2, color: '#8b5cf6' },
    { name: 'Proposal Sent', sortOrder: 3, color: '#a855f7' },
    { name: 'Negotiation', sortOrder: 4, color: '#f59e0b' },
    { name: 'Won', sortOrder: 5, color: '#10b981', isClosedWon: true },
    { name: 'Lost', sortOrder: 6, color: '#ef4444', isClosedLost: true },
  ];
  for (const s of defaultStages) {
    await prisma.stage.create({ data: { pipelineId: pipeline.id, ...s } });
  }

  // Roles
  const roleMap = new Map<string, string>();
  for (const r of template.roles) {
    const created = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions as object,
        isSystem: true,
      },
    });
    roleMap.set(r.name, created.id);
  }
  const ownerRoleId = roleMap.get('Owner')!;

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId: ownerRoleId,
      email: ownerEmail,
      passwordHash,
      fullName: `Owner of ${template.name}`,
    },
  });

  // Tables/columns/rows
  for (let i = 0; i < template.tables.length; i++) {
    const t = template.tables[i];
    const table = await prisma.customTable.create({
      data: {
        tenantId: tenant.id,
        slug: t.slug,
        name: t.name,
        description: t.description ?? null,
        icon: t.icon,
        isSystem: true,
        sortOrder: i,
      },
    });
    for (let j = 0; j < t.columns.length; j++) {
      const c = t.columns[j];
      await prisma.customColumn.create({
        data: {
          tableId: table.id,
          slug: c.slug,
          name: c.name,
          type: c.type,
          required: c.required ?? false,
          optionsJson: c.options ? (c.options as object) : undefined,
          helpText: c.helpText ?? null,
          sortOrder: j,
        },
      });
    }
    for (const row of t.sampleRows ?? []) {
      await prisma.customRow.create({
        data: { tableId: table.id, data: row as object },
      });
    }
  }

  // Default invoice sequence
  const fy = currentFinancialYear();
  await prisma.invoiceSequence.create({
    data: { tenantId: tenant.id, series: 'INV', financialYear: fy, counter: 0 },
  });

  // Sample contacts + leads
  const c1 = await prisma.contact.create({
    data: { tenantId: tenant.id, fullName: 'Priya & Arjun', email: 'priya@example.com', phone: '+91 98765 43210', source: 'instagram', notes: 'Dec 2026 wedding · ~400 guests' },
  });
  const c2 = await prisma.contact.create({
    data: { tenantId: tenant.id, fullName: 'Reena Khanna', email: 'reena@example.com', phone: '+91 98765 11122', source: 'referral', notes: 'Corporate event for 200' },
  });
  const stagesArr = await prisma.stage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { sortOrder: 'asc' } });
  await prisma.lead.create({
    data: { tenantId: tenant.id, pipelineId: pipeline.id, stageId: stagesArr[2].id, contactId: c1.id, title: 'Priya & Arjun Wedding', source: 'instagram', value: 850000, score: 70 },
  });
  await prisma.lead.create({
    data: { tenantId: tenant.id, pipelineId: pipeline.id, stageId: stagesArr[0].id, contactId: c2.id, title: 'Reena Khanna Corporate', source: 'referral', value: 320000, score: 45 },
  });

  // ── Ready-to-pay demo proposal + invoice (cheap, full-payable via Razorpay) ──
  // Kept under the gateway per-transaction cap so the whole amount clears in one
  // payment, exercising the pay → invoice PAID → project + tasks flow end-to-end.
  const demoItems = [
    { name: 'Initial Consultation', quantity: 1, unit: 'session', unitPrice: 999, amount: 999 },
    { name: 'Sample / Tasting Session', quantity: 1, unit: 'session', unitPrice: 1500, amount: 1500 },
  ];
  const demoSubtotal = demoItems.reduce((s, i) => s + i.amount, 0); // 2499
  const demoTax = Math.round(demoSubtotal * tenant.taxRate) / 100; // 449.82 @ 18%
  const demoTotal = Math.round((demoSubtotal + demoTax) * 100) / 100; // 2948.82
  const halfTax = Math.round((demoTax / 2) * 100) / 100;

  const proposalDoc = {
    title: `Booking package — ${c1.fullName}`,
    greeting: `Hi ${c1.fullName},`,
    intro: 'Thanks for considering us! This quick booking package locks your date — the fee adjusts against your final invoice.',
    sections: [
      {
        id: 'sec-booking',
        title: 'Booking & Consultation',
        items: demoItems.map((it, i) => ({ id: `it-${i}`, ...it })),
      },
    ],
    terms: 'Booking fee is adjusted against the final invoice. Proposal valid for 14 days.',
    discount: 0,
    taxRate: tenant.taxRate,
    taxLabel: tenant.taxLabel,
    currency: tenant.currency,
    clientName: c1.fullName,
    vendorName: template.name,
    validityDays: 14,
  };

  const demoProposal = await prisma.proposal.create({
    data: {
      tenantId: tenant.id,
      contactId: c1.id,
      createdById: owner.id,
      title: proposalDoc.title,
      brief: 'Quick booking package to reserve the date.',
      contentJson: proposalDoc as object,
      subtotal: demoSubtotal,
      taxAmount: demoTax,
      discount: 0,
      total: demoTotal,
      status: 'SENT',
      sentAt: new Date(),
      clientName: c1.fullName,
      clientEmail: c1.email,
      depositPercent: 0,
    },
  });

  // Allocate invoice number from the sequence and issue the invoice as SENT.
  await prisma.invoiceSequence.update({
    where: { tenantId_series_financialYear: { tenantId: tenant.id, series: 'INV', financialYear: fy } },
    data: { counter: 1 },
  });
  const invNumber = `INV/${fy}/00001`;
  await prisma.invoice.create({
    data: {
      tenantId: tenant.id,
      proposalId: demoProposal.id,
      contactId: c1.id,
      number: invNumber,
      series: 'INV',
      financialYear: fy,
      type: 'TAX',
      status: 'SENT',
      placeOfSupply: 'IN-MH',
      contentJson: { lineItems: demoItems, billToPlaceOfSupply: 'IN-MH' } as object,
      subtotal: demoSubtotal,
      cgst: halfTax,
      sgst: halfTax,
      igst: 0,
      total: demoTotal,
      amountPaid: 0,
      sentAt: new Date(),
    },
  });

  return { tenant, ownerEmail, password, demoProposalToken: demoProposal.shareToken };
}

function currentFinancialYear() {
  // Indian FY: Apr–Mar
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

async function seedPlatformAdmin() {
  const email = (process.env.SEED_PLATFORM_ADMIN_EMAIL ?? 'admin@platform.local').toLowerCase();
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD ?? 'admin123!';
  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) return { email, password: '(unchanged)' };
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.platformAdmin.create({
    data: { email, passwordHash, fullName: 'Platform Admin', role: 'ADMIN' },
  });
  return { email, password };
}

async function main() {
  console.log('▶ Seeding business types…');
  const types = await upsertBusinessTypes();
  console.log(`  ✓ ${types.length} business types`);

  console.log('▶ Seeding demo tenants…');
  const demos = [];
  for (const t of BUSINESS_TEMPLATES) {
    const bt = types.find((x) => x.slug === t.slug)!;
    const d = await seedDemoTenant(t, bt.id);
    demos.push({ businessType: t.name, ...d });
  }

  console.log('▶ Backfilling standard roles onto all tenants…');
  const rb = await backfillStandardRoles();
  console.log(`  ✓ ${rb.rolesUpserted} roles across ${rb.tenants} tenants`);

  console.log('▶ Seeding platform admin…');
  const admin = await seedPlatformAdmin();

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  DEMO LOGINS                                              │');
  console.log('├────────────────────────────────────────────────────────────┤');
  for (const d of demos) {
    console.log(`│  ${d.businessType.padEnd(24)} ${d.ownerEmail.padEnd(28)} │`);
  }
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log('│  Password (all):  demo1234                                 │');
  console.log('└────────────────────────────────────────────────────────────┘\n');

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
  console.log('READY-TO-PAY DEMO PROPOSALS (≈₹2,949 · full payment clears under gateway cap):');
  for (const d of demos) {
    if (d.demoProposalToken) {
      console.log(`  ${d.businessType.padEnd(22)} ${appUrl}/p/${d.demoProposalToken}`);
    }
  }
  console.log('');

  console.log('┌────────────────────────────────────────────────────────────┐');
  console.log('│  PLATFORM ADMIN LOGIN  (/admin)                           │');
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log(`│  ${admin.email.padEnd(38)} ${admin.password.padEnd(14)} │`);
  console.log('└────────────────────────────────────────────────────────────┘\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
