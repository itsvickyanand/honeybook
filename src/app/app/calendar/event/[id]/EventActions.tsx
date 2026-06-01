'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X, Trash2 } from 'lucide-react';

export function EventActions({ eventId, status }: { eventId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  if (status === 'CANCELLED') return null;

  async function cancel() {
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      if (!res.ok) throw new Error();
      toast.success('Meeting cancelled');
      router.refresh();
    } catch { toast.error('Could not cancel'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('Delete this event for everyone?')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Deleted');
      router.push('/app/calendar');
    } catch { toast.error('Could not delete'); } finally { setBusy(false); }
  }

  return (
    <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
      <button onClick={cancel} disabled={busy} className="btn-ghost text-sm text-amber-500"><X className="h-4 w-4" /> Cancel meeting</button>
      <button onClick={remove} disabled={busy} className="btn-ghost text-sm text-red-400"><Trash2 className="h-4 w-4" /> Delete</button>
    </div>
  );
}
