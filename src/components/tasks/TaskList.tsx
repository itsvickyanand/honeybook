'use client';

/**
 * TaskList — interactive list of tasks with inline status toggle and quick-add.
 *
 * Used by both /app/tasks (global inbox) and the Tasks tab on a Project detail
 * page. The same component handles both; pass `projectId` to scope to a project.
 */
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Check, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'DOING' | 'DONE' | 'CANCELLED';
  category?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  dueDate?: string | null;
  assigneeId?: string | null;
  sortOrder: number;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
}

export interface AssignableMember {
  id: string;
  fullName: string;
}

interface TaskListProps {
  initialTasks: TaskItem[];
  projectId?: string;
  /** Show an "Add a task" composer at the top */
  allowCreate?: boolean;
  /** When true, group by status (TODO/DOING/DONE). When false, render flat. */
  grouped?: boolean;
  /** When true, show the project name on each task. Default true outside a project page. */
  showProject?: boolean;
  /** Members assignable to tasks — renders an assignee dropdown when provided. */
  members?: AssignableMember[];
}

const PRI_COLOR: Record<TaskItem['priority'], string> = {
  HIGH: 'text-rose-600 bg-rose-50',
  MEDIUM: 'text-amber-600 bg-amber-50',
  LOW: 'text-slate-500 bg-slate-50',
};

export default function TaskList({
  initialTasks,
  projectId,
  allowCreate = true,
  grouped = false,
  showProject,
  members,
}: TaskListProps) {
  const [tasks, setTasks] = useState<TaskItem[]>(initialTasks);
  const [composing, setComposing] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [, startTransition] = useTransition();
  const showProj = showProject ?? !projectId;

  async function assign(taskId: string, assigneeId: string | null) {
    setTasks((cur) => cur.map((x) => (x.id === taskId ? { ...x, assigneeId } : x)));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assigneeId }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      toast.error((e as Error).message || 'Failed to assign');
    }
  }

  async function toggleStatus(t: TaskItem) {
    const next = t.status === 'DONE' ? 'TODO' : 'DONE';
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      toast.error((e as Error).message || 'Failed to update task');
    }
  }

  async function remove(id: string) {
    const snap = tasks;
    setTasks((cur) => cur.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setTasks(snap);
      toast.error((e as Error).message || 'Failed to delete task');
    }
  }

  async function create() {
    if (!newTitle.trim()) return;
    const title = newTitle.trim();
    setNewTitle('');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { task: TaskItem };
      setTasks((cur) => [...cur, data.task]);
    } catch (e) {
      toast.error((e as Error).message || 'Failed to create task');
      setNewTitle(title);
    }
  }

  if (grouped) {
    const todo = tasks.filter((t) => t.status === 'TODO' || t.status === 'DOING');
    const done = tasks.filter((t) => t.status === 'DONE');
    return (
      <div className="space-y-6">
        {allowCreate && (
          <Composer
            value={newTitle}
            onChange={setNewTitle}
            onSubmit={() => startTransition(() => { create(); })}
            composing={composing}
            setComposing={setComposing}
          />
        )}
        <Section title={`Open (${todo.length})`}>
          {todo.length === 0 ? (
            <EmptyState message="Nothing open. Add a task or wait for the next booking." />
          ) : (
            todo.map((t) => (
              <Row key={t.id} task={t} onToggle={toggleStatus} onDelete={remove} showProject={showProj} members={members} onAssign={assign} />
            ))
          )}
        </Section>
        {done.length > 0 && (
          <Section title={`Done (${done.length})`}>
            {done.map((t) => (
              <Row key={t.id} task={t} onToggle={toggleStatus} onDelete={remove} showProject={showProj} members={members} onAssign={assign} />
            ))}
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allowCreate && (
        <Composer
          value={newTitle}
          onChange={setNewTitle}
          onSubmit={() => startTransition(() => { create(); })}
          composing={composing}
          setComposing={setComposing}
        />
      )}
      {tasks.length === 0 ? (
        <EmptyState message="No tasks yet." />
      ) : (
        tasks.map((t) => (
          <Row key={t.id} task={t} onToggle={toggleStatus} onDelete={remove} showProject={showProj} members={members} onAssign={assign} />
        ))
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  composing,
  setComposing,
}: {
  value: string;
  onChange: (s: string) => void;
  onSubmit: () => void;
  composing: boolean;
  setComposing: (b: boolean) => void;
}) {
  if (!composing) {
    return (
      <button
        type="button"
        onClick={() => setComposing(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
      >
        <Plus size={16} />
        Add a task
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
            setComposing(false);
          }
          if (e.key === 'Escape') {
            setComposing(false);
            onChange('');
          }
        }}
        onBlur={() => {
          if (!value.trim()) setComposing(false);
        }}
        placeholder="Task title — press Enter to add"
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted)]"
      />
    </div>
  );
}

function Row({
  task,
  onToggle,
  onDelete,
  showProject,
  members,
  onAssign,
}: {
  task: TaskItem;
  onToggle: (t: TaskItem) => void;
  onDelete: (id: string) => void;
  showProject: boolean;
  members?: AssignableMember[];
  onAssign?: (taskId: string, assigneeId: string | null) => void;
}) {
  const isDone = task.status === 'DONE';
  const isOverdue =
    !isDone && task.dueDate && new Date(task.dueDate).getTime() < Date.now();

  return (
    <div
      className={cn(
        'group flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 transition hover:border-[var(--color-primary)]/40',
        isDone && 'opacity-60'
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label={isDone ? 'Mark not done' : 'Mark done'}
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
          isDone
            ? 'border-emerald-500 bg-emerald-500 text-white'
            : 'border-[var(--color-border)] hover:border-emerald-400'
        )}
      >
        {isDone && <Check size={12} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm', isDone && 'line-through')}>{task.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
          {task.dueDate && (
            <span className={cn(isOverdue && 'font-medium text-rose-600')}>
              {new Date(task.dueDate).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
          {task.category && <span>· {task.category.toLowerCase()}</span>}
          {showProject && task.project && (
            <span>· {task.project.name}</span>
          )}
          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', PRI_COLOR[task.priority])}>
            {task.priority}
          </span>
          {members && members.length > 0 && onAssign && (
            <select
              value={task.assigneeId ?? ''}
              onChange={(e) => onAssign(task.id, e.target.value || null)}
              onClick={(e) => e.stopPropagation()}
              className="ml-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[11px] text-[var(--color-text)] outline-none"
              title="Assignee"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.fullName}</option>
              ))}
            </select>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onDelete(task.id)}
        aria-label="Delete"
        className="opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  // Slim, no nested box — keeps empty sections from becoming tall empty cards.
  return (
    <div className="py-1.5 text-sm text-[var(--color-muted)]">{message}</div>
  );
}
