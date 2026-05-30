import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

async function ownedTable(id: string, tenantId: string) {
  const t = await prisma.customTable.findFirst({ where: { id, tenantId } });
  return t;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.view');
  if ('error' in auth) return auth.error;
  const table = await prisma.customTable.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { columns: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ table });
}

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(280).optional(),
  icon: z.string().max(40).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const t = await ownedTable(id, auth.tenant.id);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.customTable.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json({ table: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const t = await ownedTable(id, auth.tenant.id);
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.customTable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
