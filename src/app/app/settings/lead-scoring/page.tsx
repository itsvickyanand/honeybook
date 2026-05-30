import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ScoringEditor } from './ScoringEditor';

export default async function LeadScoringPage() {
  const ctx = await requireContext();
  const rules = await prisma.leadScoringRule.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { sortOrder: 'asc' },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">Lead scoring</h1>
        <p className="mt-1 text-[var(--color-muted)]">Rules add or subtract points when a lead is created.</p>
        <ScoringEditor
          initial={rules.map((r) => ({
            id: r.id,
            name: r.name,
            field: r.field,
            op: r.op as 'eq' | 'gt' | 'lt' | 'contains',
            value: r.value,
            points: r.points,
            active: r.active,
          }))}
        />
      </div>
    </PageTransition>
  );
}
