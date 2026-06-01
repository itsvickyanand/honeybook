'use client';

/**
 * TaskList — fully editable tasks with rich composer + inline click-to-edit.
 *
 * Every field on every row is directly editable (Linear/Asana pattern). The
 * composer at the top expands into a rich form (title, due date+time,
 * assignee, estimate, priority, category, notes) so a vendor can capture a
 * full task in one breath — explicitly the gap your earlier tasks UI had.
 *
 * Assignee picker covers project participants only: team members + the
 * project's contact + collaborators. Picking a participant routes to
 * `assigneeMemberId`; picking a team member routes to `assigneeId`.
 */
import * as React from 'react';
import { toast } from 'sonner';
import { Check, Plus, Trash2, ChevronDown, CalendarDays, User as UserIcon, Flag, Tag, Clock, FileText, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── types ────────────────────────────────────────────────────────────────────
export type TaskStatus = 'TODO' | 'DOING' | 'DONE' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskCategory = 'PREP' | 'COMMUNICATION' | 'DELIVERY' | 'ADMIN' | 'FOLLOWUP';

export interface TaskItem {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  category?: string | null;
  priority: TaskPriority;
  dueDate?: string | null;
  assigneeId?: string | null;
  assigneeMemberId?: string | null;
  estimateMinutes?: number | null;
  actualMinutes?: number | null;
  sortOrder: number;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
}

/** Unified assignee row used by the picker. Either a tenant user (userId) OR a
 *  project participant (memberId). The picker emits one of the two. */
export interface AssigneeOption {
  userId?: string;
  memberId?: string;
  name: string;
  email?: string | null;
  kind: 'TEAM' | 'CONTACT' | 'COLLABORATOR';
  initials: string;
}

interface TaskListProps {
  initialTasks: TaskItem[];
  projectId?: string;
  allowCreate?: boolean;
  grouped?: boolean;
  showProject?: boolean;
  /** Project participants — feeds the assignee picker. */
  assignees?: AssigneeOption[];
  /** Optional default filter (assignee or status) coming from a summary chip. */
  filter?: { assigneeKey?: string; status?: TaskStatus | 'OVERDUE' | 'TODAY' | 'WEEK' };
}

// ─── visual config ────────────────────────────────────────────────────────────
const PRI_COLOR: Record<TaskPriority, string> = {
  HIGH: 'text-rose-500 bg-rose-500/15 border-rose-500/40',
  MEDIUM: 'text-amber-500 bg-amber-500/15 border-amber-500/40',
  LOW: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};
const CAT_LABEL: Record<TaskCategory, string> = {
  PREP: 'Prep', COMMUNICATION: 'Comms', DELIVERY: 'Delivery', ADMIN: 'Admin', FOLLOWUP: 'Follow-up',
};
const KIND_TONE: Record<AssigneeOption['kind'], string> = {
  TEAM: 'bg-[var(--color-primary)]/15 text-[var(--color-primary-soft)]',
  CONTACT: 'bg-blue-500/15 text-blue-400',
  COLLABORATOR: 'bg-amber-500/15 text-amber-500',
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function fmtMins(m: number | null | undefined): string {
  if (!m || m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}
function parseMins(s: string): number {
  // accept "90", "90m", "1h", "1h 30m", "1.5h"
  s = s.trim().toLowerCase();
  if (!s) return 0;
  if (/^\d+m?$/.test(s)) return parseInt(s, 10);
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
  const mMatch = s.match(/(\d+)\s*m/);
  let mins = 0;
  if (hMatch) mins += Math.round(parseFloat(hMatch[1]) * 60);
  if (mMatch) mins += parseInt(mMatch[1], 10);
  return mins;
}
function toLocalIsoLike(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '');
}

// ─── component ────────────────────────────────────────────────────────────────
export default function TaskList({
  initialTasks, projectId, allowCreate = true, grouped = false, showProject,
  assignees = [], filter,
}: TaskListProps) {
  const [tasks, setTasks] = React.useState<TaskItem[]>(initialTasks);
  const showProj = showProject ?? !projectId;

  // ─ patch a single task on the server and locally ─
  async function patchTask(id: string, patch: Partial<TaskItem & { assigneeMemberId?: string | null }>) {
    setTasks((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) { toast.error((e as Error).message || 'Could not save'); }
  }
  async function removeTask(id: string) {
    const snap = tasks;
    setTasks((cur) => cur.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
    } catch { setTasks(snap); toast.error('Could not delete'); }
  }
  async function createTask(data: Partial<TaskItem & { assigneeMemberId?: string | null }>) {
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...data, projectId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { task } = (await res.json()) as { task: TaskItem };
      setTasks((cur) => [...cur, task]);
      toast.success('Task added');
    } catch (e) { toast.error((e as Error).message || 'Could not create task'); }
  }

  // ─ apply external filter (from summary chips) ─
  const filtered = React.useMemo(() => {
    if (!filter) return tasks;
    const now = Date.now();
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(); endToday.setHours(23, 59, 59, 999);
    const endWeek = new Date(); endWeek.setDate(endWeek.getDate() + 7);
    return tasks.filter((t) => {
      if (filter.assigneeKey) {
        const key = `${t.assigneeId ?? ''}|${t.assigneeMemberId ?? ''}`;
        if (key !== filter.assigneeKey) return false;
      }
      if (filter.status === 'OVERDUE') {
        return t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueDate && new Date(t.dueDate).getTime() < now;
      }
      if (filter.status === 'TODAY') {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        return d >= startToday.getTime() && d <= endToday.getTime();
      }
      if (filter.status === 'WEEK') {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate).getTime();
        return d >= startToday.getTime() && d <= endWeek.getTime();
      }
      if (filter.status === 'TODO' || filter.status === 'DOING' || filter.status === 'DONE' || filter.status === 'CANCELLED') {
        return t.status === filter.status;
      }
      return true;
    });
  }, [tasks, filter]);

  // ─ render ─
  if (grouped) {
    const open = filtered.filter((t) => t.status === 'TODO' || t.status === 'DOING');
    const done = filtered.filter((t) => t.status === 'DONE');
    return (
      <div className="space-y-6">
        {allowCreate && <RichComposer assignees={assignees} onCreate={createTask} />}
        <Section title={`Open (${open.length})`}>
          {open.length === 0
            ? <Empty>Nothing open. Add a task above.</Empty>
            : open.map((t) => <Row key={t.id} task={t} assignees={assignees} onPatch={patchTask} onDelete={removeTask} showProject={showProj} />)}
        </Section>
        {done.length > 0 && (
          <Section title={`Done (${done.length})`}>
            {done.map((t) => <Row key={t.id} task={t} assignees={assignees} onPatch={patchTask} onDelete={removeTask} showProject={showProj} />)}
          </Section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {allowCreate && <RichComposer assignees={assignees} onCreate={createTask} />}
      {filtered.length === 0
        ? <Empty>No tasks match.</Empty>
        : filtered.map((t) => <Row key={t.id} task={t} assignees={assignees} onPatch={patchTask} onDelete={removeTask} showProject={showProj} />)}
    </div>
  );
}

// ─── rich expandable composer ────────────────────────────────────────────────
function RichComposer({ assignees, onCreate }: {
  assignees: AssigneeOption[];
  onCreate: (data: Partial<TaskItem & { assigneeMemberId?: string | null }>) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [dueDate, setDueDate] = React.useState('');
  const [priority, setPriority] = React.useState<TaskPriority>('MEDIUM');
  const [category, setCategory] = React.useState<TaskCategory>('PREP');
  const [estimate, setEstimate] = React.useState('');
  const [assignee, setAssignee] = React.useState<AssigneeOption | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]">
        <Plus size={16} /> Add a task
      </button>
    );
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const payload: Partial<TaskItem & { assigneeMemberId?: string | null }> = {
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        category,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        estimateMinutes: estimate ? parseMins(estimate) : undefined,
      };
      if (assignee?.userId) payload.assigneeId = assignee.userId;
      if (assignee?.memberId) payload.assigneeMemberId = assignee.memberId;
      await onCreate(payload);
      // reset
      setTitle(''); setDescription(''); setDueDate(''); setEstimate('');
      setPriority('MEDIUM'); setCategory('PREP'); setAssignee(null);
      setOpen(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 space-y-2">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } if (e.key === 'Escape') { setOpen(false); } }}
        placeholder="Task title…"
        className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-[var(--color-muted)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
        />
        <AssigneeMenu assignees={assignees} value={assignee} onChange={setAssignee} />
        <Popover label={priority} icon={<Flag className="h-3 w-3" />}
          className={cn('border', PRI_COLOR[priority])}
          options={[{ k: 'LOW', label: 'Low' }, { k: 'MEDIUM', label: 'Medium' }, { k: 'HIGH', label: 'High' }]}
          onPick={(k) => setPriority(k as TaskPriority)}
        />
        <Popover label={CAT_LABEL[category]} icon={<Tag className="h-3 w-3" />}
          className="border border-[var(--color-border)] text-[var(--color-muted)]"
          options={(Object.keys(CAT_LABEL) as TaskCategory[]).map((k) => ({ k, label: CAT_LABEL[k] }))}
          onPick={(k) => setCategory(k as TaskCategory)}
        />
        <input
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
          placeholder="1h 30m"
          className="w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          title="Estimate"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Notes (optional)"
        rows={2}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none"
      />
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={() => setOpen(false)} className="btn-ghost text-xs">Cancel</button>
        <button onClick={submit} disabled={!title.trim() || busy} className="btn-primary text-xs">{busy ? 'Adding…' : 'Add task'}</button>
      </div>
    </div>
  );
}

// ─── row with inline click-to-edit ────────────────────────────────────────────
function Row({ task, assignees, onPatch, onDelete, showProject }: {
  task: TaskItem;
  assignees: AssigneeOption[];
  onPatch: (id: string, patch: Partial<TaskItem & { assigneeMemberId?: string | null }>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  showProject: boolean;
}) {
  const isDone = task.status === 'DONE';
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate).getTime() < Date.now();
  const [editing, setEditing] = React.useState<null | 'title' | 'desc' | 'estimate' | 'actual'>(null);
  const [expanded, setExpanded] = React.useState(false);

  const currentAssignee: AssigneeOption | null =
    task.assigneeMemberId ? (assignees.find((a) => a.memberId === task.assigneeMemberId) ?? null)
    : task.assigneeId ? (assignees.find((a) => a.userId === task.assigneeId) ?? null)
    : null;

  function toggleStatus() {
    const next = isDone ? 'TODO' : 'DONE';
    onPatch(task.id, { status: next });
  }

  return (
    <div className={cn(
      'group rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition hover:border-[var(--color-primary)]/40',
      isDone && 'opacity-60'
    )}>
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button onClick={toggleStatus} aria-label={isDone ? 'Mark not done' : 'Mark done'}
          className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
            isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--color-border)] hover:border-emerald-400'
          )}
        >{isDone && <Check size={12} strokeWidth={3} />}</button>

        <div className="min-w-0 flex-1">
          {/* Title — click to edit */}
          {editing === 'title' ? (
            <input
              autoFocus
              defaultValue={task.title}
              onBlur={(e) => { setEditing(null); if (e.target.value.trim() && e.target.value !== task.title) onPatch(task.id, { title: e.target.value.trim() }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(null); }}
              className="w-full bg-transparent text-sm font-medium outline-none"
            />
          ) : (
            <button onClick={() => setEditing('title')} className={cn('block w-full text-left text-sm font-medium', isDone && 'line-through')}>
              {task.title}
            </button>
          )}

          {/* Field chips */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {/* Due date+time */}
            <DateTimeChip
              value={task.dueDate ?? null}
              overdue={!!isOverdue}
              onChange={(iso) => onPatch(task.id, { dueDate: iso })}
            />

            {/* Assignee */}
            <AssigneeMenu
              assignees={assignees}
              value={currentAssignee}
              onChange={(a) => onPatch(task.id, {
                assigneeId: a?.userId ?? null,
                assigneeMemberId: a?.memberId ?? null,
              })}
            />

            {/* Priority */}
            <Popover label={task.priority} icon={<Flag className="h-3 w-3" />}
              className={cn('border', PRI_COLOR[task.priority])}
              options={[{ k: 'LOW', label: 'Low' }, { k: 'MEDIUM', label: 'Medium' }, { k: 'HIGH', label: 'High' }]}
              onPick={(k) => onPatch(task.id, { priority: k as TaskPriority })}
            />

            {/* Category */}
            <Popover label={CAT_LABEL[(task.category as TaskCategory) || 'PREP']} icon={<Tag className="h-3 w-3" />}
              className="border border-[var(--color-border)] text-[var(--color-muted)]"
              options={(Object.keys(CAT_LABEL) as TaskCategory[]).map((k) => ({ k, label: CAT_LABEL[k] }))}
              onPick={(k) => onPatch(task.id, { category: k })}
            />

            {/* Estimate */}
            <MinutesChip
              label="Est."
              value={task.estimateMinutes ?? null}
              onChange={(m) => onPatch(task.id, { estimateMinutes: m })}
              editing={editing === 'estimate'}
              setEditing={(b) => setEditing(b ? 'estimate' : null)}
              tone="text-[var(--color-muted)]"
            />

            {/* Actual — amber if over budget */}
            {(task.actualMinutes ?? 0) > 0 || editing === 'actual' ? (
              <MinutesChip
                label="Act."
                value={task.actualMinutes ?? null}
                onChange={(m) => onPatch(task.id, { actualMinutes: m })}
                editing={editing === 'actual'}
                setEditing={(b) => setEditing(b ? 'actual' : null)}
                tone={cn(
                  task.estimateMinutes && (task.actualMinutes ?? 0) > task.estimateMinutes
                    ? 'text-amber-500 border-amber-500/40'
                    : 'text-[var(--color-muted)]'
                )}
              />
            ) : (
              <button onClick={() => setEditing('actual')} className="inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                <Clock className="h-3 w-3" /> log time
              </button>
            )}

            {/* Project link (only outside project view) */}
            {showProject && task.project && (
              <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">{task.project.name}</span>
            )}

            {/* Expand notes */}
            <button onClick={() => setExpanded((x) => !x)} className="ml-auto inline-flex items-center gap-1 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)]">
              <FileText className="h-3 w-3" /> {task.description ? 'Notes' : 'Add notes'}
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          </div>

          {/* Notes (expandable) */}
          {expanded && (
            <textarea
              defaultValue={task.description ?? ''}
              onBlur={(e) => { if (e.target.value !== (task.description ?? '')) onPatch(task.id, { description: e.target.value || null }); }}
              placeholder="Add notes…"
              rows={3}
              className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none"
            />
          )}
        </div>

        <button onClick={() => onDelete(task.id)} aria-label="Delete"
          className="opacity-0 transition group-hover:opacity-100 hover:text-rose-500">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── reusable bits ────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-1.5 text-sm text-[var(--color-muted)]">{children}</div>;
}

function Popover({ label, icon, className, options, onPick }: {
  label: string; icon: React.ReactNode; className?: string;
  options: { k: string; label: string }[]; onPick: (k: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium', className)}>
        {icon} {label} <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 min-w-[120px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl">
            {options.map((o) => (
              <button key={o.k} onClick={() => { onPick(o.k); setOpen(false); }} className="block w-full rounded-md px-2 py-1 text-left text-xs hover:bg-[var(--color-surface-2)]">
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DateTimeChip({ value, overdue, onChange }: { value: string | null; overdue: boolean; onChange: (iso: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState(() => toLocalIsoLike(value));
  React.useEffect(() => setVal(toLocalIsoLike(value)), [value]);
  const display = value
    ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Set date';
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        value
          ? overdue ? 'border-rose-500/40 bg-rose-500/15 text-rose-500' : 'border-[var(--color-border)] text-[var(--color-muted)]'
          : 'border-dashed border-[var(--color-border)] text-[var(--color-muted)]'
      )}>
        <CalendarDays className="h-3 w-3" /> {display}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); }} />
          <div className="absolute z-20 mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-xl">
            <input
              type="datetime-local"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs"
            />
            <div className="mt-2 flex justify-end gap-1">
              {value && <button onClick={() => { onChange(null); setOpen(false); }} className="btn-ghost text-[10px] text-rose-500">Clear</button>}
              <button onClick={() => { onChange(val ? new Date(val).toISOString() : null); setOpen(false); }} className="btn-primary text-[10px]">Set</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MinutesChip({ label, value, onChange, editing, setEditing, tone }: {
  label: string; value: number | null; onChange: (m: number | null) => void;
  editing: boolean; setEditing: (b: boolean) => void; tone?: string;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={fmtMins(value)}
        placeholder="1h 30m"
        onBlur={(e) => { const m = parseMins(e.target.value); setEditing(false); if (m !== (value ?? 0)) onChange(m || null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
        className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] outline-none"
      />
    );
  }
  return (
    <button onClick={() => setEditing(true)} className={cn('inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[10px]', tone)}>
      <Clock className="h-3 w-3" /> {label} {fmtMins(value) || '—'}
    </button>
  );
}

// ─── Assignee menu (team + participants) ──────────────────────────────────────
function AssigneeMenu({ assignees, value, onChange }: {
  assignees: AssigneeOption[];
  value: AssigneeOption | null;
  onChange: (a: AssigneeOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const filtered = q ? assignees.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()) || (a.email ?? '').toLowerCase().includes(q.toLowerCase())) : assignees;
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-medium">
        {value
          ? <>
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-semibold', KIND_TONE[value.kind])}>{value.initials || initialsOf(value.name)}</span>
              <span className="truncate max-w-[100px]">{value.name}</span>
            </>
          : <><UserIcon className="h-3 w-3" /> Assign</>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl">
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="mb-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs outline-none"
            />
            <button onClick={() => { onChange(null); setOpen(false); }} className="block w-full rounded-md px-2 py-1 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]">— Unassigned —</button>
            <div className="max-h-48 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-2 py-1 text-xs text-[var(--color-muted)]">No participants. Add some to this project.</div>
              ) : filtered.map((a) => {
                const key = `${a.userId ?? ''}|${a.memberId ?? ''}`;
                return (
                  <button key={key} onClick={() => { onChange(a); setOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-[var(--color-surface-2)]">
                    <span className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold', KIND_TONE[a.kind])}>{a.initials || initialsOf(a.name)}</span>
                    <span className="flex-1 truncate">{a.name}</span>
                    <span className="text-[9px] uppercase opacity-60">{a.kind}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
