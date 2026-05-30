import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { TeamsManager } from './TeamsManager';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const ctx = await requireContext();
  const [teams, users] = await Promise.all([
    prisma.team.findMany({
      where: { tenantId: ctx.tenant.id, archived: false },
      include: {
        lead: { select: { id: true, fullName: true } },
        memberships: { include: { user: { select: { id: true, fullName: true, email: true } } } },
        _count: { select: { projects: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenant.id, status: 'ACTIVE' },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    }),
  ]);

  return (
    <PageTransition>
      <div className="mx-auto max-w-4xl p-6 md:p-10">
        <h1 className="text-3xl font-semibold">Teams</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Group people into teams, set a lead, and move members between teams. Projects can be assigned to a team.
        </p>
        <TeamsManager
          users={users}
          initialTeams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            color: t.color,
            leadUserId: t.leadUserId,
            projectCount: t._count.projects,
            members: t.memberships.map((m) => ({
              userId: m.userId,
              teamRole: m.teamRole,
              fullName: m.user.fullName,
              email: m.user.email,
            })),
          }))}
        />
      </div>
    </PageTransition>
  );
}
