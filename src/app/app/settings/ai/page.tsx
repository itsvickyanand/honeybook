import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { AIConfigForm } from './AIConfigForm';

export default async function AISettingsPage() {
  const ctx = await requireContext();
  const config = await prisma.tenantAIConfig.upsert({
    where: { tenantId: ctx.tenant.id },
    create: { tenantId: ctx.tenant.id },
    update: {},
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">AI configuration</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Steer how the proposal engine writes for {ctx.tenant.name}. Changes apply to the next generation.
        </p>
        <AIConfigForm
          initial={{
            tone: config.tone,
            upsellAggressiveness: config.upsellAggressiveness,
            marginFloorPct: config.marginFloorPct,
            customInstructions: config.customInstructions ?? '',
            mandatoryItemSlugs: (config.mandatoryItemSlugs as string[] | null) ?? [],
            blacklistedItemSlugs: (config.blacklistedItemSlugs as string[] | null) ?? [],
            embeddingModel: config.embeddingModel,
            embeddingDim: config.embeddingDim,
          }}
        />
      </div>
    </PageTransition>
  );
}
