'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { toast } from 'sonner';

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [ctx, setCtx] = React.useState<{ vendorName: string; brandColor: string; logoUrl: string | null; alreadySubmitted: boolean } | null>(null);
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [body, setBody] = React.useState('');
  const [authorName, setAuthorName] = React.useState('');
  const [done, setDone] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/reviews/${token}`).then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setCtx(d);
        if (d.alreadySubmitted) setDone(true);
      }
    });
  }, [token]);

  async function submit() {
    if (!rating) { toast.error('Pick a star rating'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/reviews/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating, body, authorName }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setDone(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const accent = ctx?.brandColor ?? '#6366f1';

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm">
        {ctx?.logoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={ctx.logoUrl} alt="" className="mb-4 h-10 w-10 rounded object-contain" />
        )}
        {done ? (
          <div className="text-center">
            <div className="text-2xl">🙏</div>
            <h1 className="mt-2 text-xl font-semibold">Thank you!</h1>
            <p className="mt-1 text-sm text-slate-600">Your feedback means a lot to {ctx?.vendorName ?? 'us'}.</p>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold">How was your experience with {ctx?.vendorName ?? 'us'}?</h1>
            <div className="mt-4 flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}>
                  <Star className="h-8 w-8" fill={(hover || rating) >= n ? accent : 'transparent'} color={accent} />
                </button>
              ))}
            </div>
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your name (optional)"
              className="mt-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Tell others about your experience…"
              className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <button
              onClick={submit}
              disabled={busy || !rating}
              className="mt-4 w-full rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: accent }}
            >
              {busy ? 'Submitting…' : 'Submit review'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
