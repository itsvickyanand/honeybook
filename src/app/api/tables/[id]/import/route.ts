import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  // mapping is { csvColumnHeader: customColumnSlug | null }
  mapping: z.record(z.string(), z.string().nullable()),
  rows: z.array(z.record(z.string(), z.string())),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('catalog.edit');
  if ('error' in auth) return auth.error;
  const table = await prisma.customTable.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { columns: true },
  });
  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const colBySlug = new Map(table.columns.map((c) => [c.slug, c]));
  const created: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;

  for (const csvRow of parsed.data.rows) {
    const data: Record<string, unknown> = {};
    let hasContent = false;
    for (const [csvHeader, slug] of Object.entries(parsed.data.mapping)) {
      if (!slug) continue;
      const col = colBySlug.get(slug);
      if (!col) continue;
      const raw = csvRow[csvHeader];
      if (raw === undefined || raw === '') continue;
      data[slug] = coerce(raw, col.type);
      hasContent = true;
    }
    if (!hasContent) { skipped++; continue; }
    const row = await prisma.customRow.create({
      data: { tableId: id, data: data as object },
    });
    created.push({ id: row.id, data });
  }

  return NextResponse.json({ created: created.length, skipped });
}

function coerce(raw: string, type: string): unknown {
  const v = raw.trim();
  switch (type) {
    case 'NUMBER':
    case 'CURRENCY': {
      const n = parseFloat(v.replace(/[,_₹$€]/g, ''));
      return Number.isFinite(n) ? n : 0;
    }
    case 'BOOLEAN':
      return /^(true|yes|1|y)$/i.test(v);
    case 'MULTI_SELECT':
      return v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
    default:
      return v;
  }
}
