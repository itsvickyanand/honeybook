/**
 * Team dashboard — per-member workload + project progress.
 * Read-only rollup so a manager can see who's doing what and how projects track.
 */
import Link from 'next/link';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { Card, CardHeader } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

export default async function TeamDashboardPage() {
  const ctx = await requireContext();

  const [members, openTasks, teams, activeProjects] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: ctx.tenant.id, status: 'ACTIVE' },
      select: { id: true, fullName: true, email: true, role: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    }),
    prisma.task.findMany({
      where: { tenantId: ctx.tenant.id, status: { in: ['TODO', 'DOING'] }, assigneeId: { not: null } },
      select: { assigneeId: true, dueDate: true },
    }),
    prisma.team.findMany({
      where: { tenantId: ctx.tenant.id, archived: false },
      include: { _count: { select: { memberships: true, projects: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.project.findMany({
      where: { tenantId: ctx.tenant.id, stage: { notIn: ['COMPLETED', 'ARCHIVED'] } },
      select: {
        id: true, name: true, stage: true,
        owner: { select: { fullName: true } },
        team: { select: { name: true } },
        tasks: { select: { status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  const now = Date.now();
  const load = new Map<string, { open: number; overdue: number }>();
  for (const t of openTasks) {
    if (!t.assigneeId) continue;
    const e = load.get(t.assigneeId) ?? { open: 0, overdue: 0 };
    e.open++;
    if (t.dueDate && t.dueDate.getTime() < now) e.overdue++;
    load.set(t.assigneeId, e);
  }
  const maxOpen = Math.max(1, ...[...load.values()].map((v) => v.open));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-10">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-[var(--color-muted)]">Workload across your people and how active projects are tracking.</p>
      </div>

      <Card>
        <CardHeader title="Workload" description="Open tasks per member (red = overdue)." />
        <div className="space-y-2">
          {members.map((m) => {
            const l = load.get(m.id) ?? { open: 0, overdue: 0 };
            return (
              <div key={m.id} className="flex items-center gap-3 text-sm">
                <div className="w-44 shrink-0">
                  <div className="truncate font-medium">{m.fullName}</div>
                  <div className="truncate text-xs text-[var(--color-muted)]">{m.role.name}</div>
                </div>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]"
                      style={{ width: `${(l.open / maxOpen) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-28 shrink-0 text-right text-xs tabular-nums">
                  <span>{l.open} open</span>
                  {l.overdue > 0 && <span className="ml-2 font-medium text-rose-500">{l.overdue} overdue</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Teams" />
          {teams.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              No teams yet. <Link href="/app/settings/teams" className="text-[var(--color-primary)] hover:underline">Create one →</Link>
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                  <span>{t.name}</span>
                  <span className="text-xs text-[var(--color-muted)]">{t._count.memberships} members · {t._count.projects} projects</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Active projects" />
          {activeProjects.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No active projects.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activeProjects.map((p) => {
                const total = p.tasks.length;
                const done = p.tasks.filter((t) => t.status === 'DONE').length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <li key={p.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                    <div className="flex items-center justify-between">
                      <Link href={`/app/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <span className="text-xs text-[var(--color-muted)]">{p.stage.toLowerCase()}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-[var(--color-muted)]">{pct}%</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-muted)]">
                      {p.owner?.fullName ? `Lead: ${p.owner.fullName}` : 'No lead'}{p.team?.name ? ` · ${p.team.name}` : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
