import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('catalog.view');
  if ('error' in auth) return auth.error;
  const galleries = await prisma.gallery.findMany({
    where: { tenantId: auth.tenant.id },
    include: { items: { include: { file: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ galleries });
}

const schema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  proposalId: z.string().optional(),
  visibility: z.enum(['CLIENT', 'TENANT']).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('catalog.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const gallery = await prisma.gallery.create({
    data: {
      tenantId: auth.tenant.id,
      title: parsed.data.title,
      description: parsed.data.description,
      proposalId: parsed.data.proposalId,
      visibility: parsed.data.visibility ?? 'CLIENT',
    },
  });
  return NextResponse.json({ gallery });
}
