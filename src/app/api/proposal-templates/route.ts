import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { DEFAULT_COVER_HTML, DEFAULT_ABOUT_HTML, DEFAULT_SECTION_ORDER, STARTER_INCLUSIONS, STARTER_TERMS, STARTER_HOUSE_PHRASES } from '@/lib/proposals';
import { STARTER_TEMPLATES } from '@/lib/proposals/starter-templates';

export async function GET() {
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const templates = await prisma.proposalTemplate.findMany({
    where: { tenantId: auth.tenant.id, archived: false },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ templates });
}

const schema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  /** Seed from one of the named starter shapes. Omit (or pass 'blank') for an
   *  empty canvas. The builder UI sends this when the user picks a starter card. */
  starter: z.enum(['classic', 'visual', 'one-pager', 'blank']).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  if (parsed.data.isDefault) {
    await prisma.proposalTemplate.updateMany({ where: { tenantId: auth.tenant.id }, data: { isDefault: false } });
  }

  // Resolve starter shape — defaults to 'classic' so a new template is always
  // immediately useful. 'blank' explicitly opts into an empty canvas.
  const starterKey = parsed.data.starter ?? 'classic';
  const starter = STARTER_TEMPLATES.find((s) => s.key === starterKey);

  const template = await prisma.proposalTemplate.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      description: parsed.data.description ?? starter?.description,
      // Legacy fields still populated — renderer prefers `blocks` when present
      // but legacy callers (per-business-type starters, settings page) still
      // expect non-null coverHtml / aboutHtml.
      coverHtml: DEFAULT_COVER_HTML,
      aboutHtml: DEFAULT_ABOUT_HTML,
      defaultIntro: starter?.defaultIntro,
      defaultInclusions: STARTER_INCLUSIONS as object,
      defaultTerms: STARTER_TERMS as object,
      defaultValidityDays: starter?.defaultValidityDays ?? 14,
      defaultDepositPercent: starter?.defaultDepositPercent ?? 25,
      toneHint: starter?.toneHint ?? 'warm',
      housePhrases: STARTER_HOUSE_PHRASES as object,
      sectionOrder: DEFAULT_SECTION_ORDER as object,
      // New: block-builder shape. Blank canvas if starter is 'blank' or unknown.
      blocks: (starter?.blocks ?? []) as object,
      isDefault: parsed.data.isDefault ?? false,
    },
  });
  return NextResponse.json({ template }, { status: 201 });
}
