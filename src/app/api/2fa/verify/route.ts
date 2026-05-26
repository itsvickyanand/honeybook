import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { nanoid } from 'nanoid';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({ code: z.string().min(6).max(8) });

export async function POST(req: Request) {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
  if (!user?.totpSecret) return NextResponse.json({ error: 'Not enrolled' }, { status: 400 });
  const ok = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token: parsed.data.code,
    window: 1,
  });
  if (!ok) return NextResponse.json({ error: 'Invalid code' }, { status: 400 });

  // Generate 8 recovery codes (hashed for storage; shown once)
  const recovery: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = nanoid(10);
    recovery.push(code);
    hashed.push(await bcrypt.hash(code, 8));
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: true, recoveryCodes: hashed as object },
  });
  return NextResponse.json({ ok: true, recoveryCodes: recovery });
}
