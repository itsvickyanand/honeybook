import { NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'auth.forgot', limit: 5, windowMs: 60_000 });
  if (blocked) return blocked;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  const email = parsed.data.email.toLowerCase().trim();

  const user = await prisma.user.findFirst({ where: { email } });

  // For demo: always return ok + include the reset URL when we actually find a user
  // (so reviewers can test without an email server). In prod, send via email and never echo.
  if (!user) {
    return NextResponse.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  }

  const token = nanoid(32);
  await prisma.passwordReset.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    },
  });

  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const resetUrl = `${base}/reset?token=${token}`;

  return NextResponse.json({
    ok: true,
    message: 'Reset link generated.',
    // Demo-mode only: surface the link so users can click it directly.
    resetUrl,
  });
}
