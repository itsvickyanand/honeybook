import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const optString = (max: number) => z.string().max(max).nullable().optional();

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
  // billing identity (Phase 1 add)
  gstin: optString(15),
  pan: optString(10),
  addressLine1: optString(200),
  addressLine2: optString(200),
  city: optString(80),
  state: optString(80),
  postalCode: optString(12),
  country: optString(2),
  contactEmail: z.string().email().nullable().optional(),
  contactPhone: optString(40),
  websiteUrl: z.string().url().nullable().optional(),
  invoiceFooter: optString(500),
});

export async function PATCH(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  // Spread defined values only — Prisma treats undefined as "leave alone".
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) data[k] = v;
  }

  const tenant = await prisma.tenant.update({
    where: { id: auth.tenant.id },
    data,
  });
  return NextResponse.json({ tenant });
}
