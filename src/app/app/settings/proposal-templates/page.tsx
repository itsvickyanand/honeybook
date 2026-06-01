import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ensureDefaultProposalTemplate } from '@/lib/proposals';
import { Manager } from './Manager';

export const dynamic = 'force-dynamic';

export default async function ProposalTemplatesPage() {
  const ctx = await requireContext();
  await ensureDefaultProposalTemplate(ctx.tenant.id);
  const templates = await prisma.proposalTemplate.findMany({
    where: { tenantId: ctx.tenant.id, archived: false },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return (
    <PageTransition>
      <div className="mx-auto max-w-[1200px] p-6 md:p-10">
        <h1 className="text-3xl font-semibold">Proposal templates</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Each business writes its house style: cover, intro, inclusions, terms, accent color — and how the AI sounds. Set one as the default and it auto-applies to every new proposal.
        </p>
        <div className="mt-6">
          <Manager
            initial={templates.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              coverHtml: t.coverHtml,
              aboutHtml: t.aboutHtml,
              defaultIntro: t.defaultIntro,
              defaultInclusions: (t.defaultInclusions as unknown as string[]) ?? [],
              defaultTerms: (t.defaultTerms as unknown as string[]) ?? [],
              defaultValidityDays: t.defaultValidityDays,
              defaultDepositPercent: t.defaultDepositPercent,
              coverImageUrl: t.coverImageUrl,
              accentColor: t.accentColor,
              showLogo: t.showLogo,
              toneHint: t.toneHint,
              housePhrases: (t.housePhrases as unknown as string[]) ?? [],
              alwaysIncludeItems: (t.alwaysIncludeItems as unknown as string[]) ?? [],
              sectionOrder: (t.sectionOrder as unknown as string[]) ?? [],
              isDefault: t.isDefault,
            }))}
          />
        </div>
      </div>
    </PageTransition>
  );
}
