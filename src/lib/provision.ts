/**
 * Provision a new tenant from a business-type template.
 *
 * Two phases:
 *
 *   Phase 1 (no tenant context yet) — runs against the bare `prisma` client.
 *     Tables touched here (BusinessType, Tenant, Role, User) must NOT have
 *     RLS, because we have no `app.current_tenant_id` to satisfy a policy
 *     against (we're creating the tenant). The auth-bootstrap tables
 *     intentionally sit outside the RLS perimeter for this reason.
 *
 *   Phase 2 (inside withTenant(newTenantId, …)) — wraps every per-tenant seed
 *     insert in a transaction that has SET LOCAL app.current_tenant_id =
 *     <new id>. RLS WITH CHECK clauses then accept the inserts because the
 *     row's tenantId matches the session GUC.
 */
import { prisma } from './db';
import { withTenant } from './db-rls';
import { hashPassword } from './auth';
import { slugify } from './utils';
import type { BusinessTemplate } from '../../prisma/business-templates';
import { getPlugin } from './plugins/registry';
import { defaultTemplate } from './portal/types';
import { currentFinancialYear } from './financial-year';

export async function provisionTenant(args: {
  businessName: string;
  businessTypeSlug: string;
  ownerEmail: string;
  ownerFullName: string;
  password: string;
}) {
  const bt = await prisma.businessType.findUnique({ where: { slug: args.businessTypeSlug } });
  if (!bt) throw new Error('Unknown business type');
  const template = bt.templateJson as unknown as Pick<BusinessTemplate, 'tables' | 'roles'>;

  // Generate a unique slug
  const baseSlug = slugify(args.businessName);
  let slug = baseSlug;
  let suffix = 1;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${suffix++}`;
  }

  // Ensure email is globally available within the tenant (it always is on a new tenant)
  const passwordHash = await hashPassword(args.password);

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name: args.businessName,
      businessTypeId: bt.id,
      brandColor: bt.accentColor,
    },
  });

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

  // Owner user
  const ownerRoleId = roleMap.get('Owner');
  if (!ownerRoleId) throw new Error('Template missing Owner role');
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId: ownerRoleId,
      email: args.ownerEmail.toLowerCase().trim(),
      passwordHash,
      fullName: args.ownerFullName,
    },
  });

  // ─── Phase 2: per-tenant seed under RLS context ───────────────────────────
  // Every insert below targets a table with RLS forced. We wrap them in
  // withTenant() so the transaction has SET LOCAL app.current_tenant_id and
  // the WITH CHECK clauses accept rows whose tenantId matches.
  await withTenant(
    tenant.id,
    async (tx) => {
    // Tables / columns / sample rows
    for (let i = 0; i < template.tables.length; i++) {
      const t = template.tables[i];
      const table = await tx.customTable.create({
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
        await tx.customColumn.create({
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
        await tx.customRow.create({
          data: { tableId: table.id, data: row as object },
        });
      }
    }

    // Default AI config
    await tx.tenantAIConfig.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id },
      update: {},
    });

    // Default pipeline + stages
    const existingPipeline = await tx.pipeline.findFirst({ where: { tenantId: tenant.id } });
    if (!existingPipeline) {
      const pipeline = await tx.pipeline.create({
        data: { tenantId: tenant.id, name: 'Sales Pipeline', isDefault: true },
      });
      const stages = [
        { name: 'New', sortOrder: 0, color: '#64748b' },
        { name: 'Contacted', sortOrder: 1, color: '#3b82f6' },
        { name: 'Qualified', sortOrder: 2, color: '#8b5cf6' },
        { name: 'Proposal Sent', sortOrder: 3, color: '#a855f7' },
        { name: 'Negotiation', sortOrder: 4, color: '#f59e0b' },
        { name: 'Won', sortOrder: 5, color: '#10b981', isClosedWon: true },
        { name: 'Lost', sortOrder: 6, color: '#ef4444', isClosedLost: true },
      ];
      for (const s of stages) {
        await tx.stage.create({ data: { pipelineId: pipeline.id, ...s } });
      }
    }

    // Default invoice sequence
    await tx.invoiceSequence.upsert({
      where: {
        tenantId_series_financialYear: {
          tenantId: tenant.id,
          series: 'INV',
          financialYear: currentFinancialYear(),
        },
      },
      create: {
        tenantId: tenant.id,
        series: 'INV',
        financialYear: currentFinancialYear(),
        counter: 0,
      },
      update: {},
    });

    // Portal template — let the plugin customize the default
    const plugin = getPlugin(args.businessTypeSlug);
    let portal = defaultTemplate(bt.accentColor);
    if (plugin?.defaultPortalTemplate) {
      portal = plugin.defaultPortalTemplate(
        { tenantId: tenant.id, businessTypeSlug: args.businessTypeSlug },
        portal
      );
    }
    await tx.portalTemplate.create({
      data: {
        tenantId: tenant.id,
        name: 'Default',
        isDefault: true,
        themeJson: portal.theme as object,
        sectionsJson: portal.sections as object,
      },
    });

    // Document packs (visa for travel, etc.)
    if (plugin?.defaultDocumentPacks) {
      const docs = plugin.defaultDocumentPacks({
        tenantId: tenant.id,
        businessTypeSlug: args.businessTypeSlug,
      });
      for (const d of docs) {
        await tx.document.create({
          data: {
            tenantId: tenant.id,
            category: d.category as 'CONTRACT' | 'VISA' | 'OTHER',
            title: d.title,
            status: 'DRAFT',
            meta: { template: true } as object,
          },
        });
      }
    }
  },
    // ~50 sequential inserts over Vercel→Neon pooler. Default 5s is too tight.
    { timeoutMs: 45_000 }
  );

  return { tenant, user };
}
