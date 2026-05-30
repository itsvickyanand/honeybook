import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.view');
  if ('error' in auth) return auth.error;
  const table = await prisma.customTable.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { columns: { orderBy: { sortOrder: 'asc' } }, rows: { orderBy: { createdAt: 'desc' } } },
  });
  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    table: { id: table.id, slug: table.slug, name: table.name, icon: table.icon, description: table.description },
    columns: table.columns.map((c) => ({
      ...c,
      options: (c.optionsJson as unknown) ?? null,
    })),
    rows: table.rows.map((r) => ({ id: r.id, data: r.data, updatedAt: r.updatedAt })),
  });
}

const rowSchema = z.object({ data: z.record(z.string(), z.unknown()) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.edit');
  if ('error' in auth) return auth.error;
  const table = await prisma.customTable.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = rowSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const row = await prisma.customRow.create({
    data: { tableId: id, data: parsed.data.data as object },
  });
  return NextResponse.json({ row: { id: row.id, data: parsed.data.data, updatedAt: row.updatedAt } });
}
