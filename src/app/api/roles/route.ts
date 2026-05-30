import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(40),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const role = await prisma.role.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      description: parsed.data.description,
      permissions: parsed.data.permissions as object,
      isSystem: false,
    },
  });
  return NextResponse.json({ role });
}
