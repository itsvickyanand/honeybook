import { requireContext } from '@/lib/session';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { WorkspaceForm } from './WorkspaceForm';

export default async function WorkspacePage() {
  const ctx = await requireContext();
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">Workspace</h1>
        <p className="mt-1 text-[var(--color-muted)]">Business identity, tax, currency.</p>
        <WorkspaceForm
          initial={{
            name: ctx.tenant.name,
            taxLabel: ctx.tenant.taxLabel,
            taxRate: ctx.tenant.taxRate,
            currency: ctx.tenant.currency,
            locale: ctx.tenant.locale,
            gstinTurnover: ctx.tenant.gstinTurnover,
            brandColor: ctx.tenant.brandColor,
            logoUrl: ctx.tenant.logoUrl,
            region: ctx.tenant.region,
          }}
        />
      </div>
    </PageTransition>
  );
}
