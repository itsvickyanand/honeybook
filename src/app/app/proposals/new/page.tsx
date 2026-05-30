import { requireContext } from '@/lib/session';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { NewProposalForm } from './NewProposalForm';
import { prisma } from '@/lib/db';

export default async function NewProposalPage() {
  const ctx = await requireContext();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const tables = await prisma.customTable.count({ where: { tenantId: ctx.tenant.id } });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <NewProposalForm
          businessTypeName={ctx.tenant.businessType.name}
          accent={ctx.tenant.businessType.accentColor}
          catalogTableCount={tables}
          contacts={contacts.map((c) => ({ id: c.id, fullName: c.fullName, email: c.email }))}
          hasAiKey={Boolean(process.env.ANTHROPIC_API_KEY)}
        />
      </div>
    </PageTransition>
  );
}
