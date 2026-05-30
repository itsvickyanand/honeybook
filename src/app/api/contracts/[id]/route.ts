/**
 * Contract template: PATCH (name/body/default), DELETE (archive).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  bodyHtml: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const t = await prisma.contractTemplate.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.contractTemplate.updateMany({ where: { tenantId: auth.tenant.id }, data: { isDefault: false } });
  }
  const template = await prisma.contractTemplate.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ template });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  await prisma.contractTemplate.updateMany({ where: { id, tenantId: auth.tenant.id }, data: { archived: true, isDefault: false } });
  return NextResponse.json({ ok: true });
}
