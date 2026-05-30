'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, Circle } from 'lucide-react';

interface T { id: string; title: string; description: string | null; status: string; dueDate: string | null }

export function CollabTasks({ token, initial }: { token: string; initial: T[] }) {
  const [tasks, setTasks] = React.useState<T[]>(initial);

  async function toggle(t: T) {
    const next = t.status === 'DONE' ? 'TODO' : 'DONE';
    setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/c/${token}/task`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId: t.id, status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTasks((p) => p.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      toast.error('Could not update task');
    }
  }

  if (tasks.length === 0) return <p className="text-sm text-[var(--color-muted)]">No tasks assigned to you.</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] px-3 py-2">
          <button onClick={() => toggle(t)} className="mt-0.5 text-[var(--color-muted)]" aria-label="Toggle done">
            {t.status === 'DONE' ? <Check className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className={`text-sm ${t.status === 'DONE' ? 'text-[var(--color-muted)] line-through' : ''}`}>{t.title}</div>
            {t.description && <div className="text-xs text-[var(--color-muted)]">{t.description}</div>}
          </div>
          {t.dueDate && <span className="shrink-0 text-xs text-[var(--color-muted)]">{new Date(t.dueDate).toLocaleDateString()}</span>}
        </li>
      ))}
    </ul>
  );
}
