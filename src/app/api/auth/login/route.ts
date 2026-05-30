import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { issueSession, verifyPassword } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'auth.login', limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: { email },
    include: { tenant: true },
  });
  if (!user || !user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  if (user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await issueSession({
    userId: user.id,
    tenantId: user.tenantId,
    roleId: user.roleId,
    email: user.email,
  });

  return NextResponse.json({ ok: true, tenantSlug: user.tenant.slug });
}
