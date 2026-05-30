import { Users, Plus } from 'lucide-react';
import { requireContext, hasPermission } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ContactsPanel } from './ContactsPanel';

export default async function ContactsPage() {
  const ctx = await requireContext();
  const contacts = await prisma.contact.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { proposals: true } } },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <ContactsPanel
          canEdit={hasPermission(ctx.permissions, 'contact.edit')}
          initialContacts={contacts.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            email: c.email,
            phone: c.phone,
            company: c.company,
            source: c.source,
            notes: c.notes,
            proposalCount: c._count.proposals,
          }))}
        />
      </div>
    </PageTransition>
  );
}
