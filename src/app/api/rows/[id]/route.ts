import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

async function owned(id: string, tenantId: string) {
  return prisma.customRow.findFirst({
    where: { id, table: { tenantId } },
  });
}

const patchSchema = z.object({ data: z.record(z.string(), z.unknown()) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.edit');
  if ('error' in auth) return auth.error;
  const r = await owned(id, auth.tenant.id);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.customRow.update({
    where: { id },
    data: { data: parsed.data.data as object, embeddingDirty: true },
  });
  return NextResponse.json({ row: { id: updated.id, data: parsed.data.data, updatedAt: updated.updatedAt } });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.edit');
  if ('error' in auth) return auth.error;
  const r = await owned(id, auth.tenant.id);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.customRow.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
