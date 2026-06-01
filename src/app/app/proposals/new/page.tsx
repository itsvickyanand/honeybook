import { requireContext } from '@/lib/session';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { NewProposalForm } from './NewProposalForm';
import { prisma } from '@/lib/db';
import { ensureDefaultProposalTemplate } from '@/lib/proposals';

export default async function NewProposalPage() {
  const ctx = await requireContext();
  await ensureDefaultProposalTemplate(ctx.tenant.id);
  const [contacts, tables, templates] = await Promise.all([
    prisma.contact.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.customTable.count({ where: { tenantId: ctx.tenant.id } }),
    prisma.proposalTemplate.findMany({
      where: { tenantId: ctx.tenant.id, archived: false },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, isDefault: true },
    }),
  ]);
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <NewProposalForm
          businessTypeName={ctx.tenant.businessType.name}
          accent={ctx.tenant.businessType.accentColor}
          catalogTableCount={tables}
          contacts={contacts.map((c) => ({ id: c.id, fullName: c.fullName, email: c.email }))}
          templates={templates}
          hasAiKey={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </div>
    </PageTransition>
  );
}
