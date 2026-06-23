import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { OnboardingWizard } from './Wizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const ctx = await requireContext();
  const session = await prisma.onboardingSession.findFirst({
    where: { tenantId: ctx.tenant.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
  });

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <OnboardingWizard
          businessName={ctx.tenant.name}
          businessTypeName={ctx.tenant.businessType.name}
          initialAnswers={(session?.answers as Record<string, unknown>) ?? {}}
          initialDraft={(session?.generatedDraft as object) ?? null}
          alreadyCompleted={!!ctx.tenant.onboardingCompletedAt}
        />
      </div>
    </PageTransition>
  );
}
