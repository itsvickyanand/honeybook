import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const TONE = ['warm', 'formal', 'concise', 'playful'] as const;

const schema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().nullable().optional(),
  coverHtml: z.string().optional(),
  aboutHtml: z.string().nullable().optional(),
  defaultIntro: z.string().nullable().optional(),
  defaultInclusions: z.array(z.string()).optional(),
  defaultTerms: z.array(z.string()).optional(),
  defaultValidityDays: z.number().int().min(1).max(180).optional(),
  defaultDepositPercent: z.number().min(0).max(100).nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  showLogo: z.boolean().optional(),
  toneHint: z.enum(TONE).optional(),
  housePhrases: z.array(z.string()).optional(),
  alwaysIncludeItems: z.array(z.string()).optional(),
  sectionOrder: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const t = await prisma.proposalTemplate.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.proposalTemplate.updateMany({ where: { tenantId: auth.tenant.id }, data: { isDefault: false } });
  }
  // Convert arrays to JSON blobs for prisma JSON columns.
  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.defaultInclusions) data.defaultInclusions = parsed.data.defaultInclusions as object;
  if (parsed.data.defaultTerms) data.defaultTerms = parsed.data.defaultTerms as object;
  if (parsed.data.housePhrases) data.housePhrases = parsed.data.housePhrases as object;
  if (parsed.data.alwaysIncludeItems) data.alwaysIncludeItems = parsed.data.alwaysIncludeItems as object;
  if (parsed.data.sectionOrder) data.sectionOrder = parsed.data.sectionOrder as object;

  const template = await prisma.proposalTemplate.update({ where: { id }, data });
  return NextResponse.json({ template });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  await prisma.proposalTemplate.updateMany({ where: { id, tenantId: auth.tenant.id }, data: { archived: true, isDefault: false } });
  return NextResponse.json({ ok: true });
}
