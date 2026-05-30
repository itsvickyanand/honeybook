import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { PipelineBoard } from './PipelineBoard';

export default async function LeadsPage() {
  const ctx = await requireContext();
  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: ctx.tenant.id, isDefault: true },
    include: {
      stages: { orderBy: { sortOrder: 'asc' } },
      leads: { include: { contact: true }, orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!pipeline) {
    return (
      <PageTransition>
        <div className="p-10 text-center text-[var(--color-muted)]">No pipeline configured.</div>
      </PageTransition>
    );
  }
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-[1400px] mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Pipeline</h1>
          <p className="mt-1 text-[var(--color-muted)]">Drag leads between stages to update.</p>
        </div>
        <PipelineBoard
          stages={pipeline.stages.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            isClosedWon: s.isClosedWon,
            isClosedLost: s.isClosedLost,
          }))}
          leads={pipeline.leads.map((l) => ({
            id: l.id,
            title: l.title,
            stageId: l.stageId,
            value: l.value,
            score: l.score,
            contactName: l.contact?.fullName ?? null,
            source: l.source,
          }))}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
