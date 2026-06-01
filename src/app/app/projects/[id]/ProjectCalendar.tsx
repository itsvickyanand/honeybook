'use client';

/**
 * Per-project calendar (workspace tab). Reuses the global aggregation API
 * scoped by projectId — so the dataset stays small and the view never feels
 * cluttered. Displays upcoming items grouped by date.
 */
import * as React from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon, CheckSquare, Folder } from 'lucide-react';

interface Item {
  id: string;
  kind: 'meeting' | 'task' | 'project';
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  href: string;
  status: string | null;
}

const ICON = { meeting: CalendarIcon, task: CheckSquare, project: Folder };

export function ProjectCalendar({ projectId }: { projectId: string }) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const from = new Date(Date.now() - 7 * 86400_000).toISOString();
    const to = new Date(Date.now() + 180 * 86400_000).toISOString();
    fetch(`/api/calendar/events?from=${from}&to=${to}&layers=meetings,tasks,projects&projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Group by yyyy-mm-dd
  const groups = React.useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const k = it.startAt.slice(0, 10);
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  if (loading) return <div className="text-sm text-[var(--color-muted)]">Loading calendar…</div>;
  if (groups.length === 0) {
    return (
      <div className="card p-8 text-center text-sm text-[var(--color-muted)]">
        Nothing scheduled. Use <strong>Schedule</strong> above to add a meeting.
      </div>
    );
  }

  return (
    <ol className="space-y-4">
      {groups.map(([day, dayItems]) => {
        const d = new Date(day);
        const isToday = new Date().toDateString() === d.toDateString();
        return (
          <li key={day}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className={`text-sm font-medium ${isToday ? 'text-[var(--color-primary)]' : ''}`}>
                {d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
              </span>
              {isToday && <span className="chip text-[10px]">Today</span>}
            </div>
            <ul className="space-y-1.5">
              {dayItems.map((it) => {
                const Icon = ICON[it.kind];
                return (
                  <li key={it.id}>
                    <Link
                      href={it.href}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 transition hover:border-[var(--color-primary)]/60"
                      style={{ borderColor: `${it.color}44` }}
                    >
                      <Icon className="h-4 w-4 shrink-0" style={{ color: it.color }} />
                      <span className="flex-1 truncate text-sm">{it.title}</span>
                      <span className="shrink-0 text-xs text-[var(--color-muted)]">
                        {it.allDay
                          ? 'All-day'
                          : new Date(it.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      {it.status && <span className="chip shrink-0 text-[10px]">{it.status}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
