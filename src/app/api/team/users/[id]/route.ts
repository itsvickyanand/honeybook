import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  roleId: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const target = await prisma.user.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (target.id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot modify yourself' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.roleId) {
    const role = await prisma.role.findFirst({
      where: { id: parsed.data.roleId, tenantId: auth.tenant.id },
    });
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 400 });
  }
  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ user: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  if (id === auth.user.id) return NextResponse.json({ error: 'Cannot delete self' }, { status: 400 });
  await prisma.user.updateMany({
    where: { id, tenantId: auth.tenant.id },
    data: { status: 'SUSPENDED' },
  });
  return NextResponse.json({ ok: true });
}
