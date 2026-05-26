import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { PortalBuilder } from './PortalBuilder';

export default async function PortalSettingsPage() {
  const ctx = await requireContext();
  const template = await prisma.portalTemplate.findFirst({
    where: { tenantId: ctx.tenant.id, isDefault: true },
  });
  const theme = (template?.themeJson ?? { primary: '#8b5cf6', accent: '#ec4899' }) as { primary: string; accent: string };
  const sections = (template?.sectionsJson ?? [
    { id: 'hero', kind: 'hero', visible: true },
    { id: 'scope', kind: 'scope', visible: true, title: 'Scope & Pricing' },
    { id: 'inclusions', kind: 'inclusions', visible: true, title: "What's included" },
    { id: 'terms', kind: 'terms', visible: true, title: 'Terms' },
    { id: 'cta', kind: 'cta', visible: true },
  ]) as { id: string; kind: string; visible: boolean; title?: string }[];
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold">Portal builder</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Customize what clients see when they open a proposal portal.
        </p>
        <PortalBuilder initialTheme={theme} initialSections={sections} />
      </div>
    </PageTransition>
  );
}
