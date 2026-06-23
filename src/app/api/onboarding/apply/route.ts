/**
 * Write the accepted subset of the draft to ProposalTemplate / ContractTemplate /
 * CustomTable+Row / TenantAIConfig. Marks the session DONE and the tenant
 * onboardingCompletedAt.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { applyDraft, type Draft, type AcceptedFlags } from '@/lib/ai/onboarding';

const schema = z.object({
  accepted: z.object({
    proposalTemplate: z.boolean().optional(),
    contractTemplate: z.boolean().optional(),
    catalog: z.boolean().optional(),
    aiConfig: z.boolean().optional(),
  }),
  draft: z.unknown().optional(), // allow client-edited draft override
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const session = await prisma.onboardingSession.findFirst({
    where: { tenantId: auth.tenant.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
  });
  const draft = (parsed.data.draft ?? session?.generatedDraft ?? null) as Draft | null;
  if (!draft) return NextResponse.json({ error: 'No draft to apply. Run Generate first.' }, { status: 400 });

  const result = await applyDraft(auth.tenant.id, draft, parsed.data.accepted as AcceptedFlags);

  if (session) {
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { status: 'DONE', completedAt: new Date(), generatedDraft: draft as object },
    });
  }
  return NextResponse.json({ ok: true, ...result });
}
