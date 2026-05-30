/**
 * My Work — the current user's personal task queue across all projects,
 * grouped by urgency. Scoped to assigneeId == me.
 */
import { requireSession, getCurrentContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { Card, CardHeader } from '@/components/ui/Card';
import TaskList, { TaskItem } from '@/components/tasks/TaskList';

export const dynamic = 'force-dynamic';

export default async function MyWorkPage() {
  await requireSession();
  const ctx = await getCurrentContext();
  if (!ctx) return null;

  const raw = await prisma.task.findMany({
    where: { tenantId: ctx.tenant.id, assigneeId: ctx.user.id, status: { not: 'CANCELLED' } },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    include: { project: { select: { id: true, name: true } } },
    take: 500,
  });

  const tasks: TaskItem[] = raw.map((t) => ({
    id: t.id, title: t.title, description: t.description,
    status: t.status as TaskItem['status'], category: t.category,
    priority: t.priority as TaskItem['priority'],
    dueDate: t.dueDate?.toISOString() ?? null,
    assigneeId: t.assigneeId, sortOrder: t.sortOrder,
    projectId: t.projectId, project: t.project,
  }));

  const now = Date.now();
  const day = 86400_000;
  const overdue = tasks.filter((t) => t.status !== 'DONE' && t.dueDate && new Date(t.dueDate).getTime() < now);
  const today = tasks.filter((t) => { if (t.status === 'DONE' || !t.dueDate) return false; const d = new Date(t.dueDate).getTime(); return d >= now && d < now + day; });
  const week = tasks.filter((t) => { if (t.status === 'DONE' || !t.dueDate) return false; const d = new Date(t.dueDate).getTime(); return d >= now + day && d < now + 7 * day; });
  const later = tasks.filter((t) => t.status !== 'DONE' && (!t.dueDate || new Date(t.dueDate).getTime() >= now + 7 * day));
  const done = tasks.filter((t) => t.status === 'DONE').slice(0, 30);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 md:p-10">
      <div>
        <h1 className="text-2xl font-semibold">My Work</h1>
        <p className="text-sm text-[var(--color-muted)]">Tasks assigned to you, across every project.</p>
      </div>
      {overdue.length > 0 && (
        <Card><CardHeader title={`Overdue · ${overdue.length}`} /><TaskList initialTasks={overdue} allowCreate={false} /></Card>
      )}
      <Card><CardHeader title={`Today · ${today.length}`} /><TaskList initialTasks={today} allowCreate={false} /></Card>
      <Card><CardHeader title={`This week · ${week.length}`} /><TaskList initialTasks={week} allowCreate={false} /></Card>
      {later.length > 0 && <Card><CardHeader title={`Later · ${later.length}`} /><TaskList initialTasks={later} allowCreate={false} /></Card>}
      {done.length > 0 && <Card><CardHeader title={`Recently done · ${done.length}`} /><TaskList initialTasks={done} allowCreate={false} /></Card>}
    </div>
  );
}
