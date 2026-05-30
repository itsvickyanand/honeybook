/**
 * Global task inbox — every open task across all the tenant's projects,
 * grouped by urgency. Vendors use this as their "what's next" view.
 */
import { requireSession, getCurrentContext, visibleProjectScope } from '@/lib/session';
import { prisma } from '@/lib/db';
import { Card, CardHeader } from '@/components/ui/Card';
import TaskList, { TaskItem } from '@/components/tasks/TaskList';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  await requireSession();
  const ctx = await getCurrentContext();
  if (!ctx) return null;

  // Scope: tasks on projects the user can see, tasks assigned to them, or
  // standalone (no-project) tasks. Owners/admins/managers see everything.
  const scope = await visibleProjectScope({
    userId: ctx.user.id,
    tenantId: ctx.tenant.id,
    permissions: ctx.permissions,
  });
  const scopeFilter =
    scope === 'all'
      ? {}
      : {
          OR: [
            { projectId: { in: scope } },
            { projectId: null },
            { assigneeId: ctx.user.id },
          ],
        };

  const raw = await prisma.task.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status: { not: 'CANCELLED' },
      ...scopeFilter,
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { sortOrder: 'asc' }],
    include: { project: { select: { id: true, name: true } } },
    take: 500,
  });

  const tasks: TaskItem[] = raw.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status as TaskItem['status'],
    category: t.category,
    priority: t.priority as TaskItem['priority'],
    dueDate: t.dueDate?.toISOString() ?? null,
    assigneeId: t.assigneeId,
    sortOrder: t.sortOrder,
    projectId: t.projectId,
    project: t.project,
  }));

  const now = Date.now();
  const dayMs = 86400_000;
  const overdue = tasks.filter(
    (t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate).getTime() < now
  );
  const today = tasks.filter((t) => {
    if (t.status === 'DONE' || !t.dueDate) return false;
    const d = new Date(t.dueDate).getTime();
    return d >= now && d < now + dayMs;
  });
  const thisWeek = tasks.filter((t) => {
    if (t.status === 'DONE' || !t.dueDate) return false;
    const d = new Date(t.dueDate).getTime();
    return d >= now + dayMs && d < now + 7 * dayMs;
  });
  const later = tasks.filter(
    (t) =>
      t.status !== 'DONE' &&
      (!t.dueDate || new Date(t.dueDate).getTime() >= now + 7 * dayMs)
  );
  const done = tasks.filter((t) => t.status === 'DONE').slice(0, 50);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-10">
      <div>
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Everything you need to do, across every project.
        </p>
      </div>

      {overdue.length > 0 && (
        <Card>
          <CardHeader title={`Overdue · ${overdue.length}`} />
          <TaskList initialTasks={overdue} grouped={false} allowCreate={false} />
        </Card>
      )}

      <Card>
        <CardHeader title={`Today · ${today.length}`} />
        <TaskList initialTasks={today} grouped={false} allowCreate={true} />
      </Card>

      <Card>
        <CardHeader title={`This week · ${thisWeek.length}`} />
        <TaskList initialTasks={thisWeek} grouped={false} allowCreate={false} />
      </Card>

      {later.length > 0 && (
        <Card>
          <CardHeader title={`Later · ${later.length}`} />
          <TaskList initialTasks={later} grouped={false} allowCreate={false} />
        </Card>
      )}

      {done.length > 0 && (
        <Card>
          <CardHeader title={`Recently done · ${done.length}`} />
          <TaskList initialTasks={done} grouped={false} allowCreate={false} />
        </Card>
      )}
    </div>
  );
}
