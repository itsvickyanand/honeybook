'use client';

/**
 * Project workspace Tasks tab — rolls up the project's task allocations
 * (by person, by status, by due) into clickable filter chips, then renders
 * the rich TaskList below scoped by the active chip.
 */
import * as React from 'react';
import TaskList, { type TaskItem, type AssigneeOption, type TaskStatus } from '@/components/tasks/TaskList';
import { cn } from '@/lib/utils';
import { AlertTriangle, Clock, CalendarCheck, CircleDot, ListChecks, CheckCircle2 } from 'lucide-react';

type Filter = { assigneeKey?: string; status?: TaskStatus | 'OVERDUE' | 'TODAY' | 'WEEK' };

function fmtMins(m: number) {
  if (!m) return '0m';
  const h = Math.floor(m / 60); const r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}

export function TasksTab({
  projectId, tasks, assignees,
}: {
  projectId: string;
  tasks: TaskItem[];
  assignees: AssigneeOption[];
}) {
  const [filter, setFilter] = React.useState<Filter>({});
  const now = Date.now();

  const open = tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
  const todayCount = open.filter((t) => t.dueDate && new Date(t.dueDate) >= startToday && new Date(t.dueDate) <= endToday).length;
  const endWeek = new Date(); endWeek.setDate(endWeek.getDate() + 7);
  const weekCount = open.filter((t) => t.dueDate && new Date(t.dueDate) >= startToday && new Date(t.dueDate) <= endWeek).length;

  const doing = tasks.filter((t) => t.status === 'DOING').length;
  const todo = tasks.filter((t) => t.status === 'TODO').length;
  const done = tasks.filter((t) => t.status === 'DONE').length;

  // Per-person rollup (key by userId+memberId so contacts/collaborators are distinct).
  const byPerson = React.useMemo(() => {
    const map = new Map<string, { option: AssigneeOption | null; open: number; overdue: number; estimate: number; actual: number }>();
    for (const t of tasks) {
      const key = `${t.assigneeId ?? ''}|${t.assigneeMemberId ?? ''}`;
      const option = key === '|' ? null :
        t.assigneeMemberId ? assignees.find((a) => a.memberId === t.assigneeMemberId) ?? null
        : assignees.find((a) => a.userId === t.assigneeId) ?? null;
      const bucket = map.get(key) ?? { option, open: 0, overdue: 0, estimate: 0, actual: 0 };
      if (t.status !== 'DONE' && t.status !== 'CANCELLED') bucket.open++;
      if (t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'DONE' && t.status !== 'CANCELLED') bucket.overdue++;
      bucket.estimate += t.estimateMinutes ?? 0;
      bucket.actual += t.actualMinutes ?? 0;
      map.set(key, bucket);
    }
    return [...map.entries()].sort(([, a], [, b]) => b.open - a.open);
  }, [tasks, assignees, now]);

  const totalEst = tasks.reduce((s, t) => s + (t.estimateMinutes ?? 0), 0);
  const totalAct = tasks.reduce((s, t) => s + (t.actualMinutes ?? 0), 0);

  function setOrToggle(next: Filter) {
    setFilter((cur) => {
      // toggle off when re-clicking the same chip
      if ((cur.assigneeKey && cur.assigneeKey === next.assigneeKey && !next.status) ||
          (cur.status && cur.status === next.status && !next.assigneeKey)) {
        return {};
      }
      return next;
    });
  }

  const active = (k: Partial<Filter>) =>
    (k.assigneeKey !== undefined && filter.assigneeKey === k.assigneeKey) ||
    (k.status !== undefined && filter.status === k.status);

  return (
    <div className="space-y-4">
      {/* Summary chip bar */}
      <div className="card p-4 space-y-3">
        {/* by status / due */}
        <div className="flex flex-wrap items-center gap-2">
          <SummaryChip active={active({ status: 'OVERDUE' })} onClick={() => setOrToggle({ status: 'OVERDUE' })} tone="rose"
            icon={<AlertTriangle className="h-3 w-3" />} label="Overdue" count={overdue} />
          <SummaryChip active={active({ status: 'TODAY' })} onClick={() => setOrToggle({ status: 'TODAY' })} tone="amber"
            icon={<Clock className="h-3 w-3" />} label="Today" count={todayCount} />
          <SummaryChip active={active({ status: 'WEEK' })} onClick={() => setOrToggle({ status: 'WEEK' })} tone="violet"
            icon={<CalendarCheck className="h-3 w-3" />} label="This week" count={weekCount} />
          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
          <SummaryChip active={active({ status: 'TODO' })} onClick={() => setOrToggle({ status: 'TODO' })} tone="slate"
            icon={<CircleDot className="h-3 w-3" />} label="To-do" count={todo} />
          <SummaryChip active={active({ status: 'DOING' })} onClick={() => setOrToggle({ status: 'DOING' })} tone="blue"
            icon={<ListChecks className="h-3 w-3" />} label="Doing" count={doing} />
          <SummaryChip active={active({ status: 'DONE' })} onClick={() => setOrToggle({ status: 'DONE' })} tone="emerald"
            icon={<CheckCircle2 className="h-3 w-3" />} label="Done" count={done} />
          {(totalEst > 0 || totalAct > 0) && (
            <span className="ml-auto text-xs text-[var(--color-muted)]">
              Estimated <strong>{fmtMins(totalEst)}</strong>{' '}
              · Logged <strong className={cn(totalAct > totalEst && totalEst > 0 && 'text-amber-500')}>{fmtMins(totalAct)}</strong>
            </span>
          )}
        </div>

        {/* by person */}
        {byPerson.length > 0 && (
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">By assignee</div>
            <div className="flex flex-wrap gap-2">
              {byPerson.map(([key, b]) => (
                <PersonChip
                  key={key}
                  active={active({ assigneeKey: key })}
                  onClick={() => setOrToggle({ assigneeKey: key })}
                  name={b.option?.name ?? 'Unassigned'}
                  kind={b.option?.kind}
                  open={b.open}
                  overdue={b.overdue}
                />
              ))}
            </div>
          </div>
        )}

        {Object.keys(filter).length > 0 && (
          <button onClick={() => setFilter({})} className="text-xs text-[var(--color-muted)] hover:underline">Clear filter</button>
        )}
      </div>

      <TaskList
        initialTasks={tasks}
        projectId={projectId}
        grouped
        showProject={false}
        assignees={assignees}
        filter={Object.keys(filter).length ? filter : undefined}
      />
    </div>
  );
}

function SummaryChip({ active, onClick, tone, icon, label, count }: {
  active: boolean; onClick: () => void;
  tone: 'rose' | 'amber' | 'violet' | 'slate' | 'blue' | 'emerald';
  icon: React.ReactNode; label: string; count: number;
}) {
  const TONE: Record<string, { base: string; on: string }> = {
    rose: { base: 'border-rose-500/30 text-rose-500', on: 'bg-rose-500/15 border-rose-500' },
    amber: { base: 'border-amber-500/30 text-amber-500', on: 'bg-amber-500/15 border-amber-500' },
    violet: { base: 'border-violet-500/30 text-violet-400', on: 'bg-violet-500/15 border-violet-500' },
    slate: { base: 'border-[var(--color-border)] text-[var(--color-muted)]', on: 'bg-[var(--color-surface-2)] border-[var(--color-text)]' },
    blue: { base: 'border-blue-500/30 text-blue-400', on: 'bg-blue-500/15 border-blue-500' },
    emerald: { base: 'border-emerald-500/30 text-emerald-500', on: 'bg-emerald-500/15 border-emerald-500' },
  };
  const t = TONE[tone];
  return (
    <button onClick={onClick} className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition',
      active ? t.on : t.base
    )}>
      {icon} {label}
      <span className="rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/10">{count}</span>
    </button>
  );
}

function PersonChip({ active, onClick, name, kind, open, overdue }: {
  active: boolean; onClick: () => void; name: string; kind?: string;
  open: number; overdue: number;
}) {
  const initials = name.trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <button onClick={onClick} className={cn(
      'inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs transition',
      active ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:bg-[var(--color-surface-2)]'
    )}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[10px] font-semibold">{initials || '?'}</span>
      <span className="truncate">{name}</span>
      {kind && <span className="text-[9px] uppercase opacity-50">{kind}</span>}
      <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-[10px]">{open}</span>
      {overdue > 0 && <span className="rounded-full bg-rose-500/20 px-1.5 text-[10px] text-rose-500">{overdue} overdue</span>}
    </button>
  );
}
