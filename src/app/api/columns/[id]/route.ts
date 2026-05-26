import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

async function owned(id: string, tenantId: string) {
  return prisma.customColumn.findFirst({
    where: { id, table: { tenantId } },
    include: { table: true },
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  helpText: z.string().max(280).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const col = await owned(id, auth.tenant.id);
  if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const updated = await prisma.customColumn.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.required !== undefined && { required: parsed.data.required }),
      ...(parsed.data.helpText !== undefined && { helpText: parsed.data.helpText }),
      ...(parsed.data.options !== undefined && {
        optionsJson: parsed.data.options as object,
      }),
    },
  });
  return NextResponse.json({ column: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const col = await owned(id, auth.tenant.id);
  if (!col) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.customColumn.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
