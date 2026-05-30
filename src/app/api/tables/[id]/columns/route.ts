import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';

const TYPES = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'IMAGE_URL',
] as const;

const schema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(TYPES),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  helpText: z.string().max(280).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const table = await prisma.customTable.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const baseSlug = slugify(parsed.data.name) || `col-${Date.now()}`;
  let slug = baseSlug;
  let i = 1;
  while (
    await prisma.customColumn.findUnique({
      where: { tableId_slug: { tableId: id, slug } },
    })
  ) {
    slug = `${baseSlug}-${i++}`;
  }

  const max = await prisma.customColumn.aggregate({
    where: { tableId: id },
    _max: { sortOrder: true },
  });

  const column = await prisma.customColumn.create({
    data: {
      tableId: id,
      slug,
      name: parsed.data.name,
      type: parsed.data.type,
      required: parsed.data.required ?? false,
      optionsJson: parsed.data.options ? (parsed.data.options as object) : undefined,
      helpText: parsed.data.helpText ?? null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ column });
}
