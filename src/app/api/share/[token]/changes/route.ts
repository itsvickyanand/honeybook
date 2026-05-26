/**
 * Public endpoint — client posts requested changes.
 * We don't directly mutate the proposal: we save the client's proposed doc as a new
 * ProposalVersion authored by "client" and flip status to CHANGES_REQUESTED.
 * The vendor reviews and can apply/reject.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { proposalDocSchema, computeTotals } from '@/lib/proposal-schema';
import { validateAndFix } from '@/lib/ai/stage-d-validate';
import type { ParsedBrief } from '@/lib/ai/types';

const schema = z.object({
  content: proposalDocSchema,
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (p.status === 'ACCEPTED' || p.status === 'DECLINED') {
    return NextResponse.json({ error: 'Proposal is closed' }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // Re-run Stage D against the client-modified doc so we surface issues
  // (over-budget, blacklisted, etc.) for the vendor when they review.
  const tenant = await prisma.tenant.findUnique({
    where: { id: p.tenantId },
    include: { aiConfig: true },
  });
  const cfg = tenant?.aiConfig;
  const validation = validateAndFix({
    doc: parsed.data.content,
    parsed: (p.parsedBrief ?? {}) as ParsedBrief,
    marginFloorPct: cfg?.marginFloorPct ?? 0,
    mandatorySlugs: ((cfg?.mandatoryItemSlugs as string[] | null) ?? []),
    blacklistedSlugs: ((cfg?.blacklistedItemSlugs as string[] | null) ?? []),
  });
  const doc = validation.doc;
  const totals = computeTotals(doc);
  const nextVersion = p.currentVersion + 1;

  await prisma.$transaction([
    prisma.proposal.update({
      where: { id: p.id },
      data: {
        status: 'CHANGES_REQUESTED',
        contentJson: doc as unknown as object,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discount: totals.discount,
        total: totals.total,
        currentVersion: nextVersion,
      },
    }),
    prisma.proposalVersion.create({
      data: {
        proposalId: p.id,
        version: nextVersion,
        contentJson: doc as unknown as object,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discount: totals.discount,
        total: totals.total,
        authoredBy: 'client',
        note: parsed.data.note ?? 'Client requested changes',
      },
    }),
    prisma.proposalEvent.create({
      data: {
        proposalId: p.id,
        type: 'CHANGE_REQUESTED',
        actor: 'client',
        payload: { note: parsed.data.note ?? null, issues: validation.issues } as object,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, issues: validation.issues });
}
