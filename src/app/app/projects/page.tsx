import { requireContext, visibleProjectScope, projectScopeWhere } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ProjectsActions } from './ProjectsActions';
import { ProjectsBoard } from './ProjectsBoard';
import { ensureProjectStages } from '@/lib/project-stages';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const ctx = await requireContext();

  // Projects board respects access scoping (Phase 3): members see only the
  // projects they're on / their team's; owners/admins/managers see all.
  const scope = await visibleProjectScope({
    userId: ctx.user.id,
    tenantId: ctx.tenant.id,
    permissions: ctx.permissions,
  });

  const [pipeline, projects, projStages] = await Promise.all([
    prisma.pipeline.findFirst({
      where: { tenantId: ctx.tenant.id, isDefault: true },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        leads: { include: { contact: true }, orderBy: { updatedAt: 'desc' } },
      },
    }),
    prisma.project.findMany({
      where: projectScopeWhere(scope, ctx.tenant.id),
      include: {
        contact: true,
        tasks: { select: { status: true, dueDate: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    ensureProjectStages(ctx.tenant.id),
  ]);
  const now = Date.now();

  // Opportunities = leads NOT yet closed-won (won ones have become projects).
  const wonStageIds = new Set(
    (pipeline?.stages ?? []).filter((s) => s.isClosedWon).map((s) => s.id)
  );

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1400px] p-6 md:p-10">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Opportunities you&apos;re winning, and the bookings you&apos;re delivering — one board.
            </p>
          </div>
          <ProjectsActions />
        </div>

        <ProjectsBoard
          oppStages={(pipeline?.stages ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
          }))}
          projStages={projStages.map((s) => ({ key: s.key, name: s.name, color: s.color }))}
          opps={(pipeline?.leads ?? [])
            .filter((l) => !wonStageIds.has(l.stageId))
            .map((l) => ({
              id: l.id,
              title: l.title,
              stageId: l.stageId,
              value: l.value,
              score: l.score,
              contactName: l.contact?.fullName ?? null,
            }))}
          projects={projects.map((p) => {
            const open = p.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
            const overdue = open.filter((t) => t.dueDate && t.dueDate.getTime() < now).length;
            return {
              id: p.id,
              name: p.name,
              stage: p.stage,
              totalValue: p.totalValue,
              amountPaid: p.amountPaid,
              contactName: p.contact?.fullName ?? null,
              tasksTotal: p.tasks.length,
              tasksOpen: open.length,
              tasksOverdue: overdue,
              serviceDate: p.startDate ? p.startDate.toISOString() : null,
              serviceType: p.serviceType ?? null,
              leadSource: p.leadSource ?? null,
            };
          })}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
