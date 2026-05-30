import { requireContext, hasPermission } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { TeamPanel } from './TeamPanel';

export default async function TeamPage() {
  const ctx = await requireContext();
  if (!hasPermission(ctx.permissions, 'team.manage')) {
    return (
      <PageTransition>
        <div className="p-10 text-center text-[var(--color-muted)]">
          You don&apos;t have permission to manage the team.
        </div>
      </PageTransition>
    );
  }

  const [users, roles, invites] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.role.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: 'asc' } }),
    prisma.userInvite.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <TeamPanel
          currentUserId={ctx.user.id}
          users={users.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            roleId: u.roleId,
            roleName: u.role.name,
            status: u.status,
          }))}
          roles={roles.map((r) => ({ id: r.id, name: r.name }))}
          invites={invites.map((i) => ({
            id: i.id,
            email: i.email,
            fullName: i.fullName,
            roleId: i.roleId,
            expiresAt: i.expiresAt.toISOString(),
            token: i.token,
          }))}
        />
      </div>
    </PageTransition>
  );
}
