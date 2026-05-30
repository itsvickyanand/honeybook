import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ensureDefaultContract } from '@/lib/contracts';
import { ContractsManager } from './ContractsManager';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const ctx = await requireContext();
  await ensureDefaultContract(ctx.tenant.id);
  const templates = await prisma.contractTemplate.findMany({
    where: { tenantId: ctx.tenant.id, archived: false },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-[1100px] p-6 md:p-10">
        <h1 className="text-3xl font-semibold">Contracts</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Write your own agreements. Use merge fields like <code>{'{{clientName}}'}</code> — they fill in automatically when a client signs.
        </p>
        <div className="mt-6">
          <ContractsManager
            initial={templates.map((t) => ({ id: t.id, name: t.name, bodyHtml: t.bodyHtml, isDefault: t.isDefault }))}
          />
        </div>
      </div>
    </PageTransition>
  );
}
