import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  taxLabel: z.string().max(20).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().max(20).optional(),
  gstinTurnover: z.number().nonnegative().optional(),
  brandColor: z.string().optional(),
  logoUrl: z.string().url().nullable().optional(),
  region: z.enum(['IN', 'MENA']).optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const tenant = await prisma.tenant.update({
    where: { id: auth.tenant.id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.taxLabel && { taxLabel: parsed.data.taxLabel }),
      ...(parsed.data.taxRate !== undefined && { taxRate: parsed.data.taxRate }),
      ...(parsed.data.currency && { currency: parsed.data.currency }),
      ...(parsed.data.locale && { locale: parsed.data.locale }),
      ...(parsed.data.gstinTurnover !== undefined && { gstinTurnover: parsed.data.gstinTurnover }),
      ...(parsed.data.brandColor && { brandColor: parsed.data.brandColor }),
      ...(parsed.data.logoUrl !== undefined && { logoUrl: parsed.data.logoUrl }),
      ...(parsed.data.region && { region: parsed.data.region }),
    },
  });
  return NextResponse.json({ tenant });
}
