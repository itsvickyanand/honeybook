'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Event {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  type: string;
  location: string | null;
  externalId: string | null;
}

const TYPE_COLOR: Record<string, string> = {
  BOOKING: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  BLOCKED: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  INTERNAL: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
};

export function CalendarClient({
  monthIso, events, googleConnected,
}: {
  monthIso: string;
  events: Event[];
  googleConnected: boolean;
}) {
  const router = useRouter();
  const month = new Date(monthIso);
  const year = month.getFullYear();
  const monthIdx = month.getMonth();

  const rangeStart = new Date(year, monthIdx, 1);
  rangeStart.setDate(rangeStart.getDate() - rangeStart.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    days.push(d);
  }

  const eventsByDay = React.useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events) {
      const k = new Date(e.startAt).toISOString().slice(0, 10);
      const arr = m.get(k) ?? [];
      arr.push(e);
      m.set(k, arr);
    }
    return m;
  }, [events]);

  const [newOpen, setNewOpen] = React.useState(false);
  const [newDate, setNewDate] = React.useState<Date | null>(null);

  function goto(delta: number) {
    const next = new Date(year, monthIdx + delta, 1);
    router.push(`/app/calendar?month=${next.toISOString().slice(0, 10)}`);
  }

  function startCreate(d: Date) {
    setNewDate(d);
    setNewOpen(true);
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Calendar</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              {month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              {googleConnected ? (
                <span className="chip ml-2 bg-emerald-500/20 text-emerald-300">Google synced</span>
              ) : (
                <Link href="/api/calendar/google/connect" className="chip ml-2 hover:border-[var(--color-primary)]/60 transition">
                  Connect Google <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => goto(-1)} className="btn-ghost p-2"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => goto(0)} className="btn-secondary">Today</button>
            <button onClick={() => goto(1)} className="btn-ghost p-2"><ChevronRight className="h-4 w-4" /></button>
            <Button onClick={() => startCreate(new Date())}><Plus className="h-4 w-4" /> New event</Button>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="grid grid-cols-7 bg-[var(--color-surface-2)] border-b">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="px-2 py-2 text-xs uppercase tracking-wider text-[var(--color-muted)] text-center">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = d.toISOString().slice(0, 10);
              const inMonth = d.getMonth() === monthIdx;
              const isToday = new Date().toDateString() === d.toDateString();
              const dayEvents = eventsByDay.get(key) ?? [];
              return (
                <div
                  key={i}
                  onClick={() => startCreate(d)}
                  className={`group h-32 border-b border-r p-1.5 cursor-pointer transition ${inMonth ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface)]/40 opacity-60'} hover:bg-[var(--color-surface-2)]`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>
                      {d.getDate()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className={`text-xs px-1.5 py-0.5 rounded border truncate ${TYPE_COLOR[e.type] ?? ''}`}
                        title={e.title}
                      >
                        {e.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-[var(--color-muted)]">+{dayEvents.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {events.length === 0 && (
          <div className="card mt-6 p-12 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No events this month</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Bookings auto-appear when clients pay. Click any date to add manually.
            </p>
          </div>
        )}
      </motion.div>

      <NewEventModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        date={newDate}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

function NewEventModal({
  open, onClose, date, onCreated,
}: { open: boolean; onClose: () => void; date: Date | null; onCreated: () => void }) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState<'BLOCKED' | 'BOOKING' | 'INTERNAL'>('BLOCKED');
  const [description, setDescription] = React.useState('');
  const [allDay, setAllDay] = React.useState(true);
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (date) {
      const day = date.toISOString().slice(0, 10);
      setStart(day + 'T10:00');
      const endDay = new Date(date);
      endDay.setHours(18, 0);
      setEnd(endDay.toISOString().slice(0, 16));
    }
  }, [date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          description: description || undefined,
          startAt: new Date(start).toISOString(),
          endAt: new Date(end).toISOString(),
          allDay,
          type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Event added');
      setTitle(''); setDescription('');
      onClose();
      onCreated();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New calendar event">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Select label="Type" value={type} onChange={(e) => setType(e.target.value as 'BLOCKED' | 'BOOKING' | 'INTERNAL')}>
          <option value="BLOCKED">Blocked (unavailable)</option>
          <option value="BOOKING">Booking</option>
          <option value="INTERNAL">Internal</option>
        </Select>
        <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All-day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          <Input label="End" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!title.trim() || !start || !end}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
