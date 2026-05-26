import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { DripsList } from './DripsList';

export default async function DripsPage() {
  const ctx = await requireContext();
  const sequences = await prisma.dripSequence.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">Email sequences</h1>
        <p className="mt-1 text-[var(--color-muted)]">Automated follow-ups triggered by events.</p>
        <DripsList
          initial={sequences.map((s) => ({
            id: s.id, name: s.name, trigger: s.trigger, active: s.active,
            stepCount: (s.stepsJson as unknown as unknown[]).length,
          }))}
        />
      </div>
    </PageTransition>
  );
}
