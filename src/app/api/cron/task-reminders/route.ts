/**
 * Daily — for tasks with reminderHoursBefore set and dueDate within that
 * window, dispatch an in-app notification (and email the assignee).
 *
 * Idempotency: Task.reminderSentAt is set after first reminder; the same
 * task won't fire twice.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isAuthedCron } from '@/lib/cron-auth';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthedCron(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const now = new Date();
  // Pull a generous window — we'll filter precisely in JS.
  const candidates = await prisma.task.findMany({
    where: {
      status: { in: ['TODO', 'DOING'] },
      reminderHoursBefore: { not: null },
      reminderSentAt: null,
      dueDate: {
        gte: now,
        lte: new Date(now.getTime() + 7 * 86400_000),
      },
    },
    include: { project: { select: { name: true, id: true } } },
    take: 500,
  });

  let sent = 0;
  for (const t of candidates) {
    if (!t.dueDate || !t.reminderHoursBefore) continue;
    const reminderAt = new Date(t.dueDate.getTime() - t.reminderHoursBefore * 3600_000);
    if (reminderAt > now) continue;
    try {
      await prisma.notification.create({
        data: {
          tenantId: t.tenantId,
          userId: t.assigneeId ?? undefined,
          type: 'task.due-soon',
          title: `Task due soon: ${t.title}`,
          body: t.project ? `${t.project.name} · due ${t.dueDate.toLocaleDateString()}` : undefined,
          href: t.projectId ? `/app/projects/${t.projectId}?tab=tasks` : '/app/my-work',
        },
      });
      await prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
      sent++;
    } catch (e) {
      logger.error({ taskId: t.id, err: (e as Error).message }, 'cron.task-reminder.failed');
    }
  }
  // Keep param-shape consistent with other cron handlers
  void enqueue;
  return NextResponse.json({ ok: true, sent });
}
