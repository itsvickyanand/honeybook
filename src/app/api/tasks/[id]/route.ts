/**
 * Single-task ops: PATCH (update fields incl. status), DELETE.
 *
 * PATCH /api/tasks/[id]  { title?, status?, dueDate?, assigneeId?, ... }
 *   - On status -> DONE, sets completedAt.
 *
 * DELETE /api/tasks/[id]
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  title: z.string().min(1).max(240).optional(),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(['TODO', 'DOING', 'DONE', 'CANCELLED']).optional(),
  category: z.enum(['PREP', 'COMMUNICATION', 'DELIVERY', 'ADMIN', 'FOLLOWUP']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  reminderHoursBefore: z.number().int().min(0).max(720).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.task.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }
  if (parsed.data.status === 'DONE' && existing.status !== 'DONE') {
    data.completedAt = new Date();
  }
  if (parsed.data.status && parsed.data.status !== 'DONE') {
    data.completedAt = null;
  }

  const task = await prisma.task.update({
    where: { id },
    data,
  });
  return NextResponse.json({ task });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;

  const existing = await prisma.task.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
