import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  stageId: z.string().optional(),
  title: z.string().min(1).optional(),
  value: z.number().nonnegative().optional(),
  score: z.number().int().min(0).max(100).optional(),
  expectedCloseAt: z.string().datetime().nullable().optional(),
  notes: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const lead = await prisma.lead.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.stageId && parsed.data.stageId !== lead.stageId) {
    await prisma.activity.create({
      data: {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        leadId: lead.id,
        type: 'STAGE_CHANGE',
        title: 'Stage changed',
        meta: { from: lead.stageId, to: parsed.data.stageId } as object,
      },
    });
  }
  const updated = await prisma.lead.update({
    where: { id },
    data: {
      ...(parsed.data.stageId && { stageId: parsed.data.stageId }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.value !== undefined && { value: parsed.data.value }),
      ...(parsed.data.score !== undefined && { score: parsed.data.score }),
      ...(parsed.data.expectedCloseAt !== undefined && {
        expectedCloseAt: parsed.data.expectedCloseAt ? new Date(parsed.data.expectedCloseAt) : null,
      }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
    },
  });
  return NextResponse.json({ lead: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  await prisma.lead.deleteMany({ where: { id, tenantId: auth.tenant.id } });
  return NextResponse.json({ ok: true });
}
