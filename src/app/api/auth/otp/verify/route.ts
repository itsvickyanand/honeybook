/**
 * Verify a mobile OTP and log the user in.
 *
 * Matches the latest unconsumed challenge for the phone, checks the code,
 * marks it consumed, then issues a session for the User whose phone matches.
 * (Signup-by-OTP for brand-new businesses still goes through the full form;
 * this endpoint logs in existing users who have a phone on file.)
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { issueSession } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6),
});

function normalizePhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  return digits;
}

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'auth.otp.verify', limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return NextResponse.json({ error: 'Code expired — request a new one' }, { status: 400 });
  if (challenge.attempts >= 5) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });

  const ok = await bcrypt.compare(parsed.data.code, challenge.codeHash);
  if (!ok) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: 'Incorrect code' }, { status: 401 });
  }
  await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });

  // Find the user by phone. (Phone isn't globally unique in schema, so take the
  // most recent active match — fine for the MVP; tighten with a unique index later.)
  const user = await prisma.user.findFirst({
    where: { phone, status: 'ACTIVE' },
    include: { tenant: { select: { slug: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!user) {
    return NextResponse.json(
      { error: 'No account found for this number. Sign up first.', verifiedPhone: phone },
      { status: 404 }
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { phoneVerified: true, lastLoginAt: new Date() } });
  await issueSession({ userId: user.id, tenantId: user.tenantId, roleId: user.roleId, email: user.email });

  return NextResponse.json({ ok: true, tenantSlug: user.tenant.slug });
}
