import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { issueSession } from '@/lib/auth';
import { provisionTenant } from '@/lib/provision';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({
  businessName: z.string().min(2).max(80),
  businessTypeSlug: z.string().min(2),
  ownerFullName: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(80),
  phone: z.string().max(20).optional(),
  // GST onboarding branch
  gstRegistered: z.boolean().optional(),
  gstin: z.string().max(15).optional(),
  pan: z.string().max(10).optional(),
  defaultSacCode: z.string().max(10).optional(),
  uiLanguage: z.enum(['en', 'hi']).optional(),
  // DPDP Act consent — required to create an account
  dpdpConsent: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the data-processing consent (DPDP Act) to continue.' }),
  }),
});

const DPDP_CONSENT_VERSION = '2026-05-v1';

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'auth.signup', limit: 5, windowMs: 60_000 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 });
  }
  const { businessName, businessTypeSlug, ownerFullName, email, password, phone,
    gstRegistered, gstin, pan, defaultSacCode, uiLanguage } = parsed.data;

  // Check duplicate email across all tenants (one email = one user max in this MVP)
  const existing = await prisma.user.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
  }

  try {
    const { tenant, user } = await provisionTenant({
      businessName,
      businessTypeSlug,
      ownerEmail: email,
      ownerFullName,
      password,
      phone,
      gstRegistered,
      gstin,
      pan,
      defaultSacCode,
      uiLanguage,
      dpdpConsentVersion: DPDP_CONSENT_VERSION,
    });

    await issueSession({
      userId: user.id,
      tenantId: tenant.id,
      roleId: user.roleId,
      email: user.email,
    });

    return NextResponse.json({ ok: true, tenantSlug: tenant.slug });
  } catch (e) {
    console.error('signup error', e);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
