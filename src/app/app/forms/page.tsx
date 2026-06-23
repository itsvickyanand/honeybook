import { Inbox } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { FormsManager } from './FormsManager';

export const dynamic = 'force-dynamic';

export default async function FormsPage() {
  const ctx = await requireContext();
  const forms = await prisma.leadForm.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, slug: true, active: true, formType: true,
      category: true, actionsJson: true, fieldsJson: true, createdAt: true,
    },
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Lead capture</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Public forms you embed on your website. Submissions become Leads or Contacts.
          </p>
        </div>
        {forms.length === 0 ? (
          <div className="card p-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No forms yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Pick a template to get started — every field is fully editable after.
            </p>
            <div className="mt-4 flex justify-center">
              <FormsManager forms={[]} />
            </div>
          </div>
        ) : (
          <FormsManager
            forms={forms.map((f) => ({
              id: f.id,
              name: f.name,
              slug: f.slug,
              active: f.active,
              formType: f.formType,
              category: f.category,
              actionsJson: f.actionsJson as unknown,
              fieldCount: Array.isArray(f.fieldsJson) ? f.fieldsJson.length : 0,
              createdAt: f.createdAt.toISOString(),
            }))}
          />
        )}
      </div>
    </PageTransition>
  );
}
