import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { Star } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const ctx = await requireContext();
  const reviews = await prisma.review.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { requestedAt: 'desc' },
    take: 200,
  });
  const submitted = reviews.filter((r) => r.rating != null);
  const avg = submitted.length
    ? (submitted.reduce((s, r) => s + (r.rating ?? 0), 0) / submitted.length).toFixed(1)
    : '—';

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl p-6 md:p-10">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Reviews</h1>
            <p className="mt-1 text-[var(--color-muted)]">Sent {reviews.length} · received {submitted.length}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-semibold">{avg}</div>
            <div className="text-xs text-[var(--color-muted)]">avg rating</div>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div className="card p-12 text-center text-sm text-[var(--color-muted)]">
            No reviews yet. Use the &quot;Request review&quot; action on a completed project.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {r.rating ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4" fill={i < r.rating! ? 'currentColor' : 'transparent'} />
                      ))
                    ) : (
                      <span className="chip text-xs">Requested</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--color-muted)]">
                    {(r.submittedAt ?? r.requestedAt).toLocaleDateString()}
                  </span>
                </div>
                {r.title && <div className="mt-2 font-medium">{r.title}</div>}
                {r.body && <p className="mt-1 text-sm text-[var(--color-muted)]">{r.body}</p>}
                {r.authorName && <div className="mt-1 text-xs text-[var(--color-muted)]">— {r.authorName}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
