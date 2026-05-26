import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { RolesEditor } from './RolesEditor';

const ALL_PERMS = [
  ['*', 'Full access (Owner)'],
  ['catalog.view', 'Catalog · view'],
  ['catalog.edit', 'Catalog · edit rows'],
  ['schema.edit', 'Catalog · edit tables & columns'],
  ['contact.view', 'Clients · view'],
  ['contact.edit', 'Clients · edit'],
  ['proposal.view', 'Proposals · view'],
  ['proposal.create', 'Proposals · create / convert'],
  ['proposal.send', 'Proposals · send + invoice transitions'],
  ['team.manage', 'Team · invite + edit + suspend'],
  ['settings.manage', 'Settings + integrations'],
] as const;

export default async function RolesPage() {
  const ctx = await requireContext();
  const roles = await prisma.role.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'asc' },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold">Roles & permissions</h1>
        <p className="mt-1 text-[var(--color-muted)]">Add custom roles or edit non-system roles.</p>
        <RolesEditor
          allPermissions={ALL_PERMS.map((p) => [p[0], p[1]] as [string, string])}
          initialRoles={roles.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            isSystem: r.isSystem,
            permissions: (r.permissions as unknown as string[]) ?? [],
          }))}
        />
      </div>
    </PageTransition>
  );
}
