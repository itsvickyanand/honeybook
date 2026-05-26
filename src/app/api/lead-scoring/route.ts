import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  rules: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    field: z.string().min(1),
    op: z.enum(['eq', 'gt', 'lt', 'contains']),
    value: z.string(),
    points: z.number().int().min(-100).max(100),
    active: z.boolean().optional(),
  })),
});

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const rules = await prisma.leadScoringRule.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { sortOrder: 'asc' },
  });
  return NextResponse.json({ rules });
}

export async function PUT(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  await prisma.$transaction([
    prisma.leadScoringRule.deleteMany({ where: { tenantId: auth.tenant.id } }),
    ...parsed.data.rules.map((r, i) =>
      prisma.leadScoringRule.create({
        data: {
          tenantId: auth.tenant.id,
          name: r.name,
          field: r.field,
          op: r.op,
          value: r.value,
          points: r.points,
          active: r.active ?? true,
          sortOrder: i,
        },
      })
    ),
  ]);
  return NextResponse.json({ ok: true });
}
