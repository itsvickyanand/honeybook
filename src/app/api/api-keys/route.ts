import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string()).min(1),
});

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const keys = await prisma.apiKey.findMany({
    where: { tenantId: auth.tenant.id, revokedAt: null },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ keys });
}

export async function POST(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const raw = `av_${nanoid(32)}`;
  const prefix = raw.slice(0, 8);
  const hash = await bcrypt.hash(raw, 10);
  const key = await prisma.apiKey.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      prefix,
      hash,
      scopes: parsed.data.scopes as object,
    },
  });
  return NextResponse.json({ key: { id: key.id, prefix, name: key.name, scopes: parsed.data.scopes }, secret: raw });
}
