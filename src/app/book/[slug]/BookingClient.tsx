'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Calendar as CalendarIcon, Check, Clock } from 'lucide-react';

interface DayAvailability { day: string; slots: { start: string; end: string }[] }

export function BookingClient({ slug, color }: { slug: string; color: string }) {
  const [days, setDays] = React.useState<DayAvailability[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<{ day: string; slot: { start: string; end: string } } | null>(null);
  const [form, setForm] = React.useState({ name: '', email: '', phone: '', notes: '' });
  const [confirming, setConfirming] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<null | { when: string }>(null);

  React.useEffect(() => {
    fetch(`/api/book/${slug}/availability`)
      .then((r) => r.json())
      .then((d) => setDays(d.days ?? []))
      .catch(() => toast.error('Could not load availability'))
      .finally(() => setLoading(false));
  }, [slug]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startAt: selected.slot.start, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setConfirmed({ when: selected.slot.start });
    } catch (e) { toast.error((e as Error).message); }
    finally { setConfirming(false); }
  }

  if (confirmed) {
    const d = new Date(confirmed.when);
    return (
      <div className="card mt-6 p-8 text-center">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500"><Check className="h-6 w-6" /></div>
        <h2 className="mt-3 text-xl font-semibold">You're booked!</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}</p>
        <p className="mt-3 text-xs text-[var(--color-muted)]">A confirmation email is on its way with a calendar invite and reschedule link.</p>
      </div>
    );
  }

  if (loading) return <div className="card mt-6 p-8 text-center text-sm text-[var(--color-muted)]">Loading available times…</div>;
  if (days.length === 0) return <div className="card mt-6 p-8 text-center text-sm text-[var(--color-muted)]">No times available right now. Try again later.</div>;

  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="card p-4">
        <div className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]"><CalendarIcon className="inline h-3 w-3" /> Pick a time</div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {days.map((d) => {
            const date = new Date(d.day);
            return (
              <div key={d.day}>
                <div className="mb-2 text-sm font-medium">{date.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {d.slots.map((s) => {
                    const t = new Date(s.start);
                    const active = selected?.slot.start === s.start;
                    return (
                      <button
                        key={s.start}
                        onClick={() => setSelected({ day: d.day, slot: s })}
                        className={`rounded-lg border px-2 py-1.5 text-sm transition ${active ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)]' : 'border-[var(--color-border)] hover:border-[var(--color-primary)]/60'}`}
                        style={active ? { borderColor: color } : undefined}
                      >
                        {t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        {selected ? (
          <form onSubmit={confirm} className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]"><Clock className="inline h-3 w-3" /> Your slot</div>
            <div className="text-sm font-medium">
              {new Date(selected.slot.start).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
            </div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" required className="input-base text-sm" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" required className="input-base text-sm" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className="input-base text-sm" />
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Anything to share?" className="input-base text-sm" />
            <button type="submit" disabled={confirming} className="btn-primary w-full">{confirming ? 'Booking…' : 'Confirm booking'}</button>
          </form>
        ) : (
          <div className="text-sm text-[var(--color-muted)]">Pick a time on the left, then enter your details to confirm.</div>
        )}
      </div>
    </div>
  );
}
