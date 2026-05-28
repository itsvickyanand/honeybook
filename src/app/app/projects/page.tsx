import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ProjectsActions } from './ProjectsActions';
import { ProjectsBoard } from './ProjectsBoard';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const ctx = await requireContext();

  const [pipeline, projects] = await Promise.all([
    prisma.pipeline.findFirst({
      where: { tenantId: ctx.tenant.id, isDefault: true },
      include: {
        stages: { orderBy: { sortOrder: 'asc' } },
        leads: { include: { contact: true }, orderBy: { updatedAt: 'desc' } },
      },
    }),
    prisma.project.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { contact: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

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
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            stage: p.stage,
            totalValue: p.totalValue,
            amountPaid: p.amountPaid,
            contactName: p.contact?.fullName ?? null,
          }))}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
