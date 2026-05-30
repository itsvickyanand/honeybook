/**
 * Platform-admin login. Separate from tenant /api/auth/login.
 * Rate-limited harder; the admin login is a juicy target.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { issuePlatformSession, verifyPlatformPassword } from '@/lib/platform-auth';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'admin.login', limit: 5, windowMs: 60_000 });
  if (blocked) return blocked;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const admin = await prisma.platformAdmin.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!admin) {
    // constant-time-ish behaviour: still hash, then reject
    await new Promise((r) => setTimeout(r, 200));
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const ok = await verifyPlatformPassword(parsed.data.password, admin.passwordHash);
  if (!ok) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  await prisma.platformAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  await issuePlatformSession({
    adminId: admin.id,
    email: admin.email,
    role: admin.role as 'ADMIN' | 'SUPPORT' | 'READONLY',
  });

  await prisma.platformAuditLog.create({
    data: {
      adminId: admin.id,
      action: 'login',
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
