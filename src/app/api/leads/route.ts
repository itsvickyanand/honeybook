import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const pipelines = await prisma.pipeline.findMany({
    where: { tenantId: auth.tenant.id },
    include: {
      stages: { orderBy: { sortOrder: 'asc' } },
      leads: { include: { contact: true }, orderBy: { updatedAt: 'desc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ pipelines });
}

const createSchema = z.object({
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  contactId: z.string().optional(),
  title: z.string().min(1),
  source: z.string().optional(),
  value: z.number().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  let pipelineId = parsed.data.pipelineId;
  let stageId = parsed.data.stageId;
  if (!pipelineId) {
    const def = await prisma.pipeline.findFirst({
      where: { tenantId: auth.tenant.id, isDefault: true },
      include: { stages: { orderBy: { sortOrder: 'asc' }, take: 1 } },
    });
    if (!def) return NextResponse.json({ error: 'No pipeline' }, { status: 400 });
    pipelineId = def.id;
    stageId = stageId ?? def.stages[0]?.id;
  }
  if (!stageId) return NextResponse.json({ error: 'Stage required' }, { status: 400 });

  const lead = await prisma.lead.create({
    data: {
      tenantId: auth.tenant.id,
      pipelineId,
      stageId,
      contactId: parsed.data.contactId,
      title: parsed.data.title,
      source: parsed.data.source,
      value: parsed.data.value ?? 0,
    },
  });
  return NextResponse.json({ lead });
}
