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
  assigneeMemberId: z.string().nullable().optional(), // assign to a project participant
  sortOrder: z.number().int().optional(),
  reminderHoursBefore: z.number().int().min(0).max(720).nullable().optional(),
  estimateMinutes: z.number().int().min(0).max(60 * 1000).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(60 * 1000).nullable().optional(),
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
  // Assigning to a participant clears the internal-user assignee and vice versa.
  if (parsed.data.assigneeMemberId !== undefined && parsed.data.assigneeMemberId) {
    data.assigneeId = null;
  }
  if (parsed.data.assigneeId !== undefined && parsed.data.assigneeId) {
    data.assigneeMemberId = null;
  }
  if (parsed.data.status === 'DONE' && existing.status !== 'DONE') {
    data.completedAt = new Date();
  }
  if (parsed.data.status && parsed.data.status !== 'DONE') {
    data.completedAt = null;
  }
  // Track who assigned + when, and log an activity on (re)assignment.
  const assigneeChanged =
    parsed.data.assigneeId !== undefined && parsed.data.assigneeId !== existing.assigneeId;
  if (assigneeChanged) {
    data.assignedById = auth.user.id;
    data.assignedAt = parsed.data.assigneeId ? new Date() : null;
  }

  const task = await prisma.task.update({ where: { id }, data });

  if (assigneeChanged) {
    const assignee = parsed.data.assigneeId
      ? await prisma.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { fullName: true } })
      : null;
    await prisma.activity.create({
      data: {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        projectId: existing.projectId ?? undefined,
        type: 'TASK',
        title: assignee ? `Task assigned to ${assignee.fullName}` : 'Task unassigned',
        body: existing.title,
        meta: { taskId: id, assigneeId: parsed.data.assigneeId ?? null } as object,
      },
    }).catch(() => {});
    // Notify the new assignee.
    if (parsed.data.assigneeId) {
      await prisma.notification.create({
        data: {
          tenantId: auth.tenant.id,
          userId: parsed.data.assigneeId,
          type: 'task.assigned',
          title: `You were assigned: ${existing.title}`,
          href: existing.projectId ? `/app/projects/${existing.projectId}?tab=tasks` : '/app/my-work',
        },
      }).catch(() => {});
    }
  }
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
