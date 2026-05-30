import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { slugify } from '@/lib/utils';

export async function GET() {
  const auth = await requireApi('catalog.view');
  if ('error' in auth) return auth.error;
  const tables = await prisma.customTable.findMany({
    where: { tenantId: auth.tenant.id },
    include: { _count: { select: { rows: true, columns: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json({ tables });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(280).optional(),
  icon: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('schema.edit');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const baseSlug = slugify(parsed.data.name);
  let slug = baseSlug || `table-${Date.now()}`;
  let i = 1;
  while (
    await prisma.customTable.findUnique({
      where: { tenantId_slug: { tenantId: auth.tenant.id, slug } },
    })
  ) {
    slug = `${baseSlug}-${i++}`;
  }

  const max = await prisma.customTable.aggregate({
    where: { tenantId: auth.tenant.id },
    _max: { sortOrder: true },
  });

  const table = await prisma.customTable.create({
    data: {
      tenantId: auth.tenant.id,
      slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      icon: parsed.data.icon ?? 'Package',
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ table });
}
