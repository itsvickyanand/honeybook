import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { ProposalDoc, computeTotals } from '@/lib/proposal-schema';
import { ClientPortal } from './ClientPortal';
import { defaultTemplate, PortalTemplateData, SectionConfig, Theme } from '@/lib/portal/types';
import { parseBlocks } from '@/lib/proposals/blocks';
import { getStorage } from '@/lib/storage';
import { formatCurrency } from '@/lib/utils';

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
  const [galleries, documents, proposalTemplate, paymentSchedule] = await Promise.all([
    prisma.gallery.findMany({
      where: { tenantId: p.tenantId, OR: [{ proposalId: p.id }, { visibility: 'CLIENT' }] },
      include: { items: { include: { file: true }, orderBy: { sortOrder: 'asc' } } },
      take: 3,
    }),
    prisma.document.findMany({
      where: { tenantId: p.tenantId, OR: [{ proposalId: p.id }, { meta: { path: ['template'], equals: true } }] },
    }),
    // Resolve the proposal's chosen template (or the tenant default). Used for
    // the new block-builder render path.
    p.proposalTemplateId
      ? prisma.proposalTemplate.findUnique({ where: { id: p.proposalTemplateId } })
      : prisma.proposalTemplate.findFirst({ where: { tenantId: p.tenantId, isDefault: true, archived: false } }),
    // Payment schedule rows so the payment-schedule block has real data when
    // a project already exists.
    p.projectId
      ? prisma.paymentSchedule.findFirst({
          where: { projectId: p.projectId, tenantId: p.tenantId },
          include: { items: { orderBy: { dueDate: 'asc' } } },
        })
      : null,
  ]);

  // Parse the template's blocks JSON. If absent/invalid, ClientPortal falls
  // back to its legacy React layout — zero breakage for templates that haven't
  // been opened in the new builder yet.
  const templateBlocks = parseBlocks(proposalTemplate?.blocks);

  // Pre-compute totals + format currency once on the server — keeps the block
  // renderer pure on the client side.
  const totals = computeTotals(doc);
  const fmt = (n: number) => formatCurrency(n, p.tenant.currency, p.tenant.locale);
  const renderTotals = {
    subTotal: fmt(totals.subtotal),
    discount: fmt(totals.discount),
    tax: fmt(totals.taxAmount),
    total: fmt(totals.total),
    taxLabel: doc.taxLabel ?? p.tenant.taxLabel ?? 'GST',
    taxRate: doc.taxRate ?? 18,
  };

  // Resolve gallery thumbnail URLs (presigned R2 GETs) so the block renderer
  // can embed them directly. We do at most 3 galleries × 6 items = 18 lookups,
  // bounded.
  const storage = getStorage();
  const galleryThumbsResolved = await Promise.all(
    galleries.map(async (g) => ({
      id: g.id,
      title: g.title,
      thumbnailUrls: await Promise.all(
        g.items.slice(0, 6).map((it) => storage.publicUrl(it.file.storageKey)),
      ),
    })),
  );

  const paymentScheduleRows = paymentSchedule?.items?.map((it) => ({
    label: it.label,
    dueDate: it.dueDate ? it.dueDate.toISOString().slice(0, 10) : null,
    amount: fmt(it.amount),
  })) ?? [];

  return (
    <ClientPortal
      token={token}
      initialDoc={doc}
      status={p.status === 'SENT' ? 'VIEWED' : p.status}
      depositPercent={p.depositPercent ?? 0}
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
      templateBlocks={templateBlocks}
      blockRenderData={{
        accentColor: proposalTemplate?.accentColor ?? p.tenant.brandColor ?? p.tenant.businessType.accentColor,
        vendorLogoUrl: p.tenant.logoUrl ?? null,
        totals: renderTotals,
        galleries: galleryThumbsResolved,
        paymentSchedule: paymentScheduleRows,
        defaultDepositPercent: proposalTemplate?.defaultDepositPercent ?? p.depositPercent ?? null,
        appUrl: process.env.APP_URL ?? '',
      }}
    />
  );
}
