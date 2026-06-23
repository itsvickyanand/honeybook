/**
 * Proposal template builder — Phase 2 entry point.
 *
 * Loads the template + supporting data (galleries, meeting types) and hands
 * everything to the client Builder. The actual drag/drop + edit lives there.
 */
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { parseBlocks } from '@/lib/proposals/blocks';
import { Builder } from './Builder';

export const dynamic = 'force-dynamic';

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();

  const template = await prisma.proposalTemplate.findFirst({
    where: { id, tenantId: ctx.tenant.id, archived: false },
  });
  if (!template) notFound();

  // Galleries + meeting types feed the gallery/calendar-booking block editors.
  const [galleries, meetingTypes] = await Promise.all([
    prisma.gallery.findMany({
      where: { tenantId: ctx.tenant.id },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.meetingType.findMany({
      where: { tenantId: ctx.tenant.id, active: true, archived: false },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
  ]);

  // template.blocks might be null (legacy AI-onboarded templates without the
  // builder shape, or templates from before TB-1). Treat null as empty canvas
  // — the lazy-migrate plan said this is the moment we lock in the new shape.
  const blocks = parseBlocks(template.blocks) ?? [];

  return (
    <Builder
      templateId={template.id}
      templateName={template.name}
      initialBlocks={blocks}
      vendorName={ctx.tenant.name}
      brandColor={ctx.tenant.brandColor}
      galleries={galleries}
      meetingTypes={meetingTypes}
    />
  );
}
