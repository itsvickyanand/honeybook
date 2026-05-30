import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { NewInvoiceForm } from './NewInvoiceForm';

export default async function NewInvoicePage() {
  const ctx = await requireContext();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { fullName: 'asc' },
    select: { id: true, fullName: true, email: true },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <NewInvoiceForm
          contacts={contacts}
          tenantPlaceOfSupply="IN-MH"
          taxLabel={ctx.tenant.taxLabel}
          taxRate={ctx.tenant.taxRate}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
        />
      </div>
    </PageTransition>
  );
}
