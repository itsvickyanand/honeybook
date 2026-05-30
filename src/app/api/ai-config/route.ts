import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  tone: z.enum(['warm-professional', 'casual', 'luxury', 'minimal']).optional(),
  upsellAggressiveness: z.number().int().min(0).max(3).optional(),
  marginFloorPct: z.number().min(0).max(100).optional(),
  mandatoryItemSlugs: z.array(z.string()).optional(),
  blacklistedItemSlugs: z.array(z.string()).optional(),
  customInstructions: z.string().max(2000).optional(),
});

export async function GET() {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const config = await prisma.tenantAIConfig.upsert({
    where: { tenantId: auth.tenant.id },
    create: { tenantId: auth.tenant.id },
    update: {},
  });
  return NextResponse.json({ config });
}

export async function PATCH(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.tone) data.tone = parsed.data.tone;
  if (parsed.data.upsellAggressiveness !== undefined) data.upsellAggressiveness = parsed.data.upsellAggressiveness;
  if (parsed.data.marginFloorPct !== undefined) data.marginFloorPct = parsed.data.marginFloorPct;
  if (parsed.data.mandatoryItemSlugs) data.mandatoryItemSlugs = parsed.data.mandatoryItemSlugs as object;
  if (parsed.data.blacklistedItemSlugs) data.blacklistedItemSlugs = parsed.data.blacklistedItemSlugs as object;
  if (parsed.data.customInstructions !== undefined) data.customInstructions = parsed.data.customInstructions;

  const config = await prisma.tenantAIConfig.upsert({
    where: { tenantId: auth.tenant.id },
    create: { tenantId: auth.tenant.id, ...data },
    update: data,
  });
  return NextResponse.json({ config });
}
