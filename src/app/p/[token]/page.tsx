import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ProposalDoc } from '@/lib/proposal-schema';
import { ClientPortal } from './ClientPortal';
import { defaultTemplate, PortalTemplateData, SectionConfig, Theme } from '@/lib/portal/types';

export default async function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: { include: { businessType: true } } },
  });
  if (!p) notFound();

  // Record VIEWED on first server render after SENT
  if (p.status === 'SENT') {
    await prisma.proposal.update({ where: { id: p.id }, data: { status: 'VIEWED' } });
    await prisma.proposalEvent.create({
      data: { proposalId: p.id, type: 'VIEWED', actor: 'client' },
    });
    // Lifecycle fan-out: bell + activity + (lead stays on Proposal Sent)
    const { onProposalStatusChanged } = await import('@/lib/lifecycle');
    onProposalStatusChanged(p.id, 'VIEWED', 'SENT').catch(() => {});
  }

  const portalTemplate = await prisma.portalTemplate.findFirst({
    where: { tenantId: p.tenantId, isDefault: true },
  });
  const tmpl: PortalTemplateData = portalTemplate
    ? {
        theme: portalTemplate.themeJson as unknown as Theme,
        sections: portalTemplate.sectionsJson as unknown as SectionConfig[],
      }
    : defaultTemplate(p.tenant.businessType.accentColor);

  const doc = p.contentJson as unknown as ProposalDoc;

  // Load supporting data the dynamic sections might need
  const [galleries, documents] = await Promise.all([
    prisma.gallery.findMany({
      where: { tenantId: p.tenantId, OR: [{ proposalId: p.id }, { visibility: 'CLIENT' }] },
      include: { items: { include: { file: true }, orderBy: { sortOrder: 'asc' } } },
      take: 3,
    }),
    prisma.document.findMany({
      where: { tenantId: p.tenantId, OR: [{ proposalId: p.id }, { meta: { path: ['template'], equals: true } }] },
    }),
  ]);

  return (
    <ClientPortal
      token={token}
      initialDoc={doc}
      status={p.status === 'SENT' ? 'VIEWED' : p.status}
      currency={p.tenant.currency}
      locale={p.tenant.locale}
      taxLabel={p.tenant.taxLabel}
      vendor={{
        name: p.tenant.name,
        brandColor: p.tenant.brandColor,
        businessType: p.tenant.businessType.name,
        accentColor: p.tenant.businessType.accentColor,
      }}
      template={tmpl}
      galleries={galleries.map((g) => ({
        id: g.id,
        title: g.title,
        items: g.items.map((it) => ({
          id: it.id,
          fileId: it.fileId,
          approved: it.approved,
        })),
      }))}
      documents={documents.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        status: d.status,
        isTemplate: !!(d.meta as { template?: boolean } | null)?.template,
      }))}
    />
  );
}
