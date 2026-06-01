import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { runProposalPipeline } from '@/lib/ai/pipeline';
import { computeTotals } from '@/lib/proposal-schema';
import { enqueue, JOB_NAMES } from '@/lib/queue';

const schema = z.object({
  title: z.string().min(1).max(160),
  brief: z.string().min(10).max(4000),
  clientName: z.string().min(1).max(120),
  clientEmail: z.string().email().optional().or(z.literal('')).optional(),
  contactId: z.string().optional(),
  /** Which proposal template shapes this proposal (else tenant default). */
  proposalTemplateId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  // Kick off embedding builds for any dirty catalog rows (non-blocking).
  prisma.customRow.findMany({
    where: { table: { tenantId: auth.tenant.id }, embeddingDirty: true },
    select: { id: true },
    take: 50,
  }).then((dirty) => {
    for (const r of dirty) enqueue(JOB_NAMES.EMBEDDINGS_BUILD_ROW, { rowId: r.id });
  }).catch(() => {});

  const { doc, parsedBrief, issues, templateId } = await runProposalPipeline({
    tenantId: auth.tenant.id,
    brief: parsed.data.brief,
    clientName: parsed.data.clientName,
    proposalTemplateId: parsed.data.proposalTemplateId,
  });
  doc.title = parsed.data.title;
  // Single source of truth for tax: seed the proposal's rate from the tenant's
  // configured GST rate. The vendor can override it per-proposal in the editor;
  // every downstream amount (invoice, pay link, portal) then reads doc.taxRate.
  doc.taxRate = auth.tenant.taxRate ?? doc.taxRate;
  const totals = computeTotals(doc);

  // Default deposit %: template wins over the legacy heuristic. Falls back to
  // 25% on totals above ₹50k so big bookings stay collectable under gateway caps.
  const tpl = await prisma.proposalTemplate.findUnique({ where: { id: templateId } });
  const defaultDeposit = tpl?.defaultDepositPercent ?? (totals.total > 50000 ? 25 : 0);

  // Auto-link to an existing Lead for this contact, if any.
  let leadId: string | undefined;
  if (parsed.data.contactId) {
    const lead = await prisma.lead.findFirst({
      where: { tenantId: auth.tenant.id, contactId: parsed.data.contactId },
      orderBy: { createdAt: 'desc' },
    });
    leadId = lead?.id;
  }

  const proposal = await prisma.proposal.create({
    data: {
      tenantId: auth.tenant.id,
      createdById: auth.user.id,
      contactId: parsed.data.contactId,
      leadId,
      title: parsed.data.title,
      brief: parsed.data.brief,
      parsedBrief: parsedBrief as object,
      aiIssues: issues as unknown as object,
      clientName: parsed.data.clientName,
      clientEmail: parsed.data.clientEmail || null,
      contentJson: doc as unknown as object,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      discount: totals.discount,
      total: totals.total,
      depositPercent: defaultDeposit,
      proposalTemplateId: templateId,
      status: 'DRAFT',
      currentVersion: 1,
      versions: {
        create: {
          version: 1,
          contentJson: doc as unknown as object,
          subtotal: totals.subtotal,
          taxAmount: totals.taxAmount,
          discount: totals.discount,
          total: totals.total,
          authoredBy: auth.user.id,
          note: 'Initial AI generation',
        },
      },
    },
  });

  return NextResponse.json({
    proposal: { id: proposal.id, shareToken: proposal.shareToken },
    parsedBrief,
    issues,
  });
}
