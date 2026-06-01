'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Save, Copy, Trash2, ExternalLink } from 'lucide-react';

interface MT {
  id: string; name: string; slug: string; durationMins: number; bufferMins: number;
  locationType: string; locationDetail: string | null; color: string;
  advanceNoticeHours: number; maxBookingDays: number; hostUserId: string | null; active: boolean;
}
interface Rule { dayOfWeek: number; startTime: string; endTime: string }
interface UserOpt { id: string; fullName: string; email: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function SchedulingManager({
  initialMeetingTypes, initialRules, users, currentUserId,
}: {
  initialMeetingTypes: MT[]; initialRules: Rule[]; users: UserOpt[]; currentUserId: string;
}) {
  return (
    <div className="space-y-8">
      <MeetingTypes initial={initialMeetingTypes} users={users} currentUserId={currentUserId} />
      <Availability initial={initialRules} />
    </div>
  );
}

function MeetingTypes({ initial, users, currentUserId }: { initial: MT[]; users: UserOpt[]; currentUserId: string }) {
  const router = useRouter();
  const [items, setItems] = React.useState<MT[]>(initial);

  async function create() {
    const res = await fetch('/api/meeting-types', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New meeting', durationMins: 30, hostUserId: currentUserId }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? 'Failed');
    setItems((p) => [...p, data.item]);
  }

  async function patch(id: string, patch: Partial<MT>) {
    setItems((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await fetch(`/api/meeting-types/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  }
  async function remove(id: string) {
    await fetch(`/api/meeting-types/${id}`, { method: 'DELETE' });
    setItems((p) => p.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Meeting types</h2>
          <p className="text-sm text-[var(--color-muted)]">Each one becomes a Calendly-style booking link.</p>
        </div>
        <button onClick={create} className="btn-primary text-sm"><Plus className="h-4 w-4" /> New meeting type</button>
      </header>
      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-[var(--color-muted)]">No meeting types yet.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((m) => {
            const url = typeof window !== 'undefined' ? `${window.location.origin}/book/${m.slug}` : `/book/${m.slug}`;
            return (
              <li key={m.id} className="card p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Name">
                      <input value={m.name} onChange={(e) => patch(m.id, { name: e.target.value })} className="input-base text-sm" />
                    </Field>
                    <Field label="Duration">
                      <select value={m.durationMins} onChange={(e) => patch(m.id, { durationMins: Number(e.target.value) })} className="input-base text-sm">
                        {[15, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n} min</option>)}
                      </select>
                    </Field>
                    <Field label="Location">
                      <select value={m.locationType} onChange={(e) => patch(m.id, { locationType: e.target.value })} className="input-base text-sm">
                        <option value="GOOGLE_MEET">Google Meet</option>
                        <option value="ZOOM">Zoom</option>
                        <option value="IN_PERSON">In person</option>
                        <option value="PHONE">Phone</option>
                        <option value="CUSTOM">Custom link</option>
                      </select>
                    </Field>
                    <Field label="Buffer">
                      <select value={m.bufferMins} onChange={(e) => patch(m.id, { bufferMins: Number(e.target.value) })} className="input-base text-sm">
                        {[0, 5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} min</option>)}
                      </select>
                    </Field>
                    <Field label="Advance notice">
                      <select value={m.advanceNoticeHours} onChange={(e) => patch(m.id, { advanceNoticeHours: Number(e.target.value) })} className="input-base text-sm">
                        {[0, 2, 12, 24, 48].map((n) => <option key={n} value={n}>{n} hours</option>)}
                      </select>
                    </Field>
                    <Field label="Book up to">
                      <select value={m.maxBookingDays} onChange={(e) => patch(m.id, { maxBookingDays: Number(e.target.value) })} className="input-base text-sm">
                        {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n} days ahead</option>)}
                      </select>
                    </Field>
                    <Field label="Host">
                      <select value={m.hostUserId ?? ''} onChange={(e) => patch(m.id, { hostUserId: e.target.value || null })} className="input-base text-sm">
                        {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                      </select>
                    </Field>
                    <Field label="Active">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={m.active} onChange={(e) => patch(m.id, { active: e.target.checked })} /> Bookable
                      </label>
                    </Field>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs">
                      <code className="truncate">{url}</code>
                      <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Copied'); }} className="btn-ghost ml-1 px-1.5 py-0.5"><Copy className="h-3 w-3" /></button>
                      <Link href={`/book/${m.slug}`} target="_blank" className="btn-ghost px-1.5 py-0.5"><ExternalLink className="h-3 w-3" /></Link>
                    </div>
                    <button onClick={() => remove(m.id)} className="btn-ghost text-xs text-red-400"><Trash2 className="h-3 w-3" /> Remove</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Availability({ initial }: { initial: Rule[] }) {
  // Convert to a per-day editable shape. Single window per day for simplicity.
  const [days, setDays] = React.useState(() => {
    const map = new Map<number, { enabled: boolean; start: string; end: string }>();
    for (let i = 0; i < 7; i++) map.set(i, { enabled: false, start: '10:00', end: '19:00' });
    for (const r of initial) map.set(r.dayOfWeek, { enabled: true, start: r.startTime, end: r.endTime });
    return Array.from(map.entries()).map(([dayOfWeek, v]) => ({ dayOfWeek, ...v }));
  });
  const [saving, setSaving] = React.useState(false);

  function update(idx: number, patch: Partial<{ enabled: boolean; start: string; end: string }>) {
    setDays((p) => p.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  async function save() {
    setSaving(true);
    try {
      const rules = days.filter((d) => d.enabled).map((d) => ({ dayOfWeek: d.dayOfWeek, startTime: d.start, endTime: d.end }));
      const res = await fetch('/api/availability', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules }) });
      if (!res.ok) throw new Error();
      toast.success('Availability saved');
    } catch { toast.error('Could not save'); } finally { setSaving(false); }
  }

  return (
    <section>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Your weekly availability</h2>
          <p className="text-sm text-[var(--color-muted)]">When clients can book meetings with you.</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save className="h-4 w-4" /> Save</button>
      </header>
      <div className="card divide-y">
        {days.map((d, i) => (
          <div key={d.dayOfWeek} className="grid grid-cols-[100px_60px_1fr] items-center gap-3 px-4 py-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
              {DAYS[d.dayOfWeek]}
            </label>
            <span className="text-xs text-[var(--color-muted)]">{d.enabled ? 'Open' : 'Closed'}</span>
            {d.enabled ? (
              <div className="flex items-center gap-2">
                <input type="time" value={d.start} onChange={(e) => update(i, { start: e.target.value })} className="input-base w-28 text-sm" />
                <span className="text-[var(--color-muted)]">to</span>
                <input type="time" value={d.end} onChange={(e) => update(i, { end: e.target.value })} className="input-base w-28 text-sm" />
              </div>
            ) : (
              <span className="text-xs text-[var(--color-muted)]">—</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label-base">{label}</span>
      {children}
    </label>
  );
}
