'use client';

/**
 * Meetings-first calendar with togglable layers (best-practice density control).
 *  - Month view shows MEETINGS (colored blocks) and PROJECT date chips by
 *    default; tasks appear as a small "+N" dot, fully togglable.
 *  - Filters by who (mine/team) and which project, persisted in the URL.
 *  - Click a day to quick-create a meeting/blocked event.
 *
 * Data comes from /api/calendar/events which aggregates events + tasks +
 * project dates so the visuals stay decoupled from storage.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, ExternalLink, Users, User, Filter, Calendar as CalendarIcon, CheckSquare, Folder } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Item {
  id: string;
  kind: 'meeting' | 'task' | 'project';
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  href: string;
  projectId: string | null;
  status: string | null;
}

type WhoFilter = 'mine' | 'team';

export function CalendarClient({
  monthIso, googleConnected, projects, contacts, initialProjectId, currentUserId,
}: {
  monthIso: string;
  googleConnected: boolean;
  projects: { id: string; name: string }[];
  contacts: { id: string; fullName: string; email: string | null }[];
  initialProjectId: string | null;
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const month = new Date(monthIso);
  const year = month.getFullYear();
  const monthIdx = month.getMonth();

  // Layer toggles — meetings + projects on by default; tasks off in month view.
  const [showMeetings, setShowMeetings] = React.useState(true);
  const [showProjects, setShowProjects] = React.useState(true);
  const [showTasks, setShowTasks] = React.useState(false);
  const [who, setWho] = React.useState<WhoFilter>('mine');
  const [projectId, setProjectId] = React.useState<string | null>(initialProjectId);
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Visible range (full 6 weeks). Memoize so referential identity is stable
  // across renders — otherwise the fetch effect below would re-fire forever.
  const { rangeStart, rangeEnd, days } = React.useMemo(() => {
    const start = new Date(year, monthIdx, 1);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 42);
    const ds: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      ds.push(d);
    }
    return { rangeStart: start, rangeEnd: end, days: ds };
  }, [year, monthIdx]);

  // Manual refresh sentinel (incremented after creating a new event).
  const [refreshTick, setRefreshTick] = React.useState(0);

  // Fetch aggregated items when range/layers/filters change.
  React.useEffect(() => {
    const layers = [showMeetings && 'meetings', showProjects && 'projects', showTasks && 'tasks'].filter(Boolean).join(',');
    const qs = new URLSearchParams({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      layers: layers || 'meetings',
    });
    if (projectId) qs.set('projectId', projectId);
    if (who === 'mine') qs.set('userId', currentUserId);
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/calendar/events?${qs.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch((e) => { if ((e as Error).name !== 'AbortError') toast.error('Could not load calendar'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
    // monthIso is the canonical "range" input; rangeStart/rangeEnd are derived
    // from it via the memo above, so we deliberately depend on monthIso only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthIso, showMeetings, showProjects, showTasks, who, projectId, currentUserId, refreshTick]);

  // Group items per day for rendering.
  const itemsByDay = React.useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      // Multi-day project chips span — drop them into every covered day.
      const start = new Date(it.startAt);
      const end = new Date(it.endAt);
      const d = new Date(start);
      d.setHours(0, 0, 0, 0);
      while (d <= end) {
        const k = d.toISOString().slice(0, 10);
        const arr = m.get(k) ?? [];
        arr.push(it);
        m.set(k, arr);
        d.setDate(d.getDate() + 1);
      }
    }
    return m;
  }, [items]);

  function goto(delta: number) {
    const next = new Date(year, monthIdx + delta, 1);
    const params = new URLSearchParams();
    params.set('month', next.toISOString().slice(0, 10));
    if (projectId) params.set('project', projectId);
    router.push(`${pathname}?${params.toString()}`);
  }

  const [newOpen, setNewOpen] = React.useState(false);
  const [newDate, setNewDate] = React.useState<Date | null>(null);

  function startCreate(d: Date) {
    setNewDate(d);
    setNewOpen(true);
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold">Calendar</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              {month.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              {googleConnected ? (
                <span className="chip ml-2 bg-emerald-500/20 text-emerald-300">Google synced</span>
              ) : (
                <Link href="/api/integrations/google/connect" className="chip ml-2 hover:border-[var(--color-primary)]/60 transition">
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

        {/* Layer + filter bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]"><Filter className="inline h-3 w-3" /> Layers</span>
          <LayerChip active={showMeetings} onToggle={() => setShowMeetings((v) => !v)} color="#8b5cf6"><CalendarIcon className="h-3 w-3" /> Meetings</LayerChip>
          <LayerChip active={showProjects} onToggle={() => setShowProjects((v) => !v)} color="#f59e0b"><Folder className="h-3 w-3" /> Projects</LayerChip>
          <LayerChip active={showTasks} onToggle={() => setShowTasks((v) => !v)} color="#3b82f6"><CheckSquare className="h-3 w-3" /> Tasks</LayerChip>

          <span className="mx-2 h-4 w-px bg-[var(--color-border)]" />

          <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-xs">
            <button onClick={() => setWho('mine')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${who === 'mine' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}><User className="h-3 w-3" /> Mine</button>
            <button onClick={() => setWho('team')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${who === 'team' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}><Users className="h-3 w-3" /> Team</button>
          </div>

          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
          >
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {loading && <span className="ml-auto text-xs text-[var(--color-muted)]">Loading…</span>}
        </div>

        {/* Month grid */}
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
              const dayItems = itemsByDay.get(key) ?? [];
              const meetings = dayItems.filter((x) => x.kind === 'meeting');
              const projectChips = dayItems.filter((x) => x.kind === 'project');
              const taskCount = dayItems.filter((x) => x.kind === 'task').length;

              return (
                <div
                  key={i}
                  onClick={() => startCreate(d)}
                  className={`group h-32 border-b border-r p-1.5 cursor-pointer transition ${inMonth ? 'bg-[var(--color-surface)]' : 'bg-[var(--color-surface)]/40 opacity-60'} hover:bg-[var(--color-surface-2)]`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-xs ${isToday ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white font-semibold' : 'text-[var(--color-muted)]'}`}>
                      {d.getDate()}
                    </span>
                    {taskCount > 0 && (
                      <Link
                        href={`/app/projects?project=${projectId ?? ''}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400"
                        title={`${taskCount} task${taskCount === 1 ? '' : 's'} due`}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" /> {taskCount}
                      </Link>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {/* Project chips first — thin pastel bars */}
                    {projectChips.slice(0, 2).map((p) => (
                      <Link
                        key={p.id}
                        href={p.href}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate rounded-sm px-1 text-[10px] font-medium leading-4 hover:underline"
                        style={{ background: `${p.color}20`, color: p.color, borderLeft: `2px solid ${p.color}` }}
                        title={p.title}
                      >
                        {p.title}
                      </Link>
                    ))}
                    {/* Meetings — solid blocks */}
                    {meetings.slice(0, 3).map((e) => (
                      <Link
                        key={e.id}
                        href={e.href}
                        onClick={(ev) => ev.stopPropagation()}
                        className="block truncate rounded px-1.5 py-0.5 text-xs"
                        style={{ background: `${e.color}1f`, color: e.color, border: `1px solid ${e.color}44` }}
                        title={`${e.title} · ${new Date(e.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                      >
                        {!e.allDay && <span className="opacity-70">{new Date(e.startAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · </span>}
                        {e.title}
                      </Link>
                    ))}
                    {meetings.length > 3 && (
                      <div className="text-[10px] text-[var(--color-muted)]">+{meetings.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: '#8b5cf6' }} /> Meetings</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: '#f59e0b' }} /> Project dates</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: '#3b82f6' }} /> Tasks due (toggle on)</span>
        </div>
      </motion.div>

      <NewEventModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        date={newDate}
        projects={projects}
        contacts={contacts}
        googleConnected={googleConnected}
        defaultProjectId={projectId}
        onCreated={() => {
          setNewOpen(false);
          setRefreshTick((n) => n + 1);
          router.refresh();
        }}
      />
    </div>
  );
}

function LayerChip({ active, onToggle, color, children }: { active: boolean; onToggle: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${active ? 'bg-[var(--color-surface-2)]' : 'opacity-60'}`}
      style={{ borderColor: `${color}66`, color: active ? color : undefined }}
    >
      {children}
    </button>
  );
}

function NewEventModal({
  open, onClose, date, projects, contacts, googleConnected, defaultProjectId, onCreated,
}: {
  open: boolean; onClose: () => void; date: Date | null;
  projects: { id: string; name: string }[];
  contacts: { id: string; fullName: string; email: string | null }[];
  googleConnected: boolean;
  defaultProjectId: string | null;
  onCreated: () => void;
}) {
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState<'MEETING' | 'BLOCKED'>('MEETING');
  const [description, setDescription] = React.useState('');
  const [allDay, setAllDay] = React.useState(false);
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [videoUrl, setVideoUrl] = React.useState('');
  const [projectId, setProjectId] = React.useState<string>(defaultProjectId ?? '');
  const [contactId, setContactId] = React.useState<string>('');
  const [attendeeEmail, setAttendeeEmail] = React.useState('');
  const [attendeeName, setAttendeeName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (date) {
      const day = date.toISOString().slice(0, 10);
      setStart(day + 'T10:00');
      const endDay = new Date(date);
      endDay.setHours(11, 0);
      setEnd(endDay.toISOString().slice(0, 16));
    }
    setProjectId(defaultProjectId ?? '');
  }, [date, defaultProjectId]);

  // When picking a contact, auto-fill email so vendor sees who'll be invited.
  React.useEffect(() => {
    if (!contactId) return;
    const c = contacts.find((x) => x.id === contactId);
    if (c?.email) setAttendeeEmail(c.email);
    if (c?.fullName) setAttendeeName(c.fullName);
  }, [contactId, contacts]);

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
          location: location || undefined,
          videoUrl: videoUrl || undefined,
          kind,
          projectId: projectId || undefined,
          contactId: contactId || undefined,
          attendeeEmail: attendeeEmail || undefined,
          attendeeName: attendeeName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(kind === 'MEETING' ? (attendeeEmail ? `Invite sent to ${attendeeEmail}` : 'Meeting scheduled') : 'Time blocked');
      setTitle(''); setDescription(''); setLocation(''); setVideoUrl('');
      setContactId(''); setAttendeeEmail(''); setAttendeeName('');
      onCreated();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="New event">
      <form onSubmit={submit} className="space-y-3">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5 text-xs">
          <button type="button" onClick={() => setKind('MEETING')} className={`rounded-md px-3 py-1 ${kind === 'MEETING' ? 'bg-[var(--color-surface)] font-medium' : 'text-[var(--color-muted)]'}`}>Meeting</button>
          <button type="button" onClick={() => setKind('BLOCKED')} className={`rounded-md px-3 py-1 ${kind === 'BLOCKED' ? 'bg-[var(--color-surface)] font-medium' : 'text-[var(--color-muted)]'}`}>Blocked time</button>
        </div>
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All-day
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
          <Input label="End" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
        {kind === 'MEETING' && (
          <>
            <div>
              <label className="label-base">Invite a contact</label>
              <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="input-base text-sm">
                <option value="">— Pick a contact (optional) —</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.email ? ` · ${c.email}` : ''}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Attendee name" value={attendeeName} onChange={(e) => setAttendeeName(e.target.value)} placeholder="(or pick contact above)" />
              <Input label="Attendee email" type="email" value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} placeholder="they@example.com" />
            </div>
            <p className="text-[11px] text-[var(--color-muted)]">
              {googleConnected
                ? 'Google will email the invite + Meet link to the attendee.'
                : 'We will email a calendar invite (ICS) to the attendee.'}
            </p>
            <Input label="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Office / Cafe / Address" />
            <Input label="Video link (optional)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="Leave blank to auto-generate Google Meet" />
            <div>
              <label className="label-base">Link to project (optional)</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input-base text-sm">
                <option value="">— None —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </>
        )}
        <Textarea label="Notes" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex justify-end gap-2 border-t pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!title.trim() || !start || !end}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}
