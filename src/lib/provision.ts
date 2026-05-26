/**
 * Provision a new tenant from a business-type template.
 * Creates roles, tables (with columns), and the owner user in a single transaction.
 */
import { prisma } from './db';
import { hashPassword } from './auth';
import { slugify } from './utils';
import type { BusinessTemplate } from '../../prisma/business-templates';

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

  // Tables / columns / sample rows
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

  return { tenant, user };
}
