/**
 * Seed: business types + one demo tenant per type.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { BUSINESS_TEMPLATES, BusinessTemplate } from './business-templates';

const prisma = new PrismaClient();

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
        templateJson: { tables: t.tables, roles: t.roles } as object,
      },
      create: {
        slug: t.slug,
        name: t.name,
        description: t.description,
        icon: t.icon,
        accentColor: t.accentColor,
        templateJson: { tables: t.tables, roles: t.roles } as object,
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

  await prisma.tenant.deleteMany({ where: { slug: tenantSlug } });

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

  await prisma.user.create({
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

  return { tenant, ownerEmail, password };
}

function currentFinancialYear() {
  // Indian FY: Apr–Mar
  const now = new Date();
  const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
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

  console.log('\n┌────────────────────────────────────────────────────────────┐');
  console.log('│  DEMO LOGINS                                              │');
  console.log('├────────────────────────────────────────────────────────────┤');
  for (const d of demos) {
    console.log(`│  ${d.businessType.padEnd(24)} ${d.ownerEmail.padEnd(28)} │`);
  }
  console.log('├────────────────────────────────────────────────────────────┤');
  console.log('│  Password (all):  demo1234                                 │');
  console.log('└────────────────────────────────────────────────────────────┘\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
