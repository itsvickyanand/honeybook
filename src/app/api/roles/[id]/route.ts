import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(40).optional(),
  description: z.string().max(200).nullable().optional(),
  permissions: z.array(z.string()).min(1).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const role = await prisma.role.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: 'System role cannot be edited' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.role.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      ...(parsed.data.permissions && { permissions: parsed.data.permissions as object }),
    },
  });
  return NextResponse.json({ role: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const role = await prisma.role.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: 'System role' }, { status: 400 });
  const users = await prisma.user.count({ where: { roleId: id } });
  if (users > 0) return NextResponse.json({ error: 'Role is in use' }, { status: 400 });
  await prisma.role.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
