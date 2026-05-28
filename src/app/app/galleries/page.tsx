import Link from 'next/link';
import { Images, Plus } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { GalleriesActions } from './GalleriesActions';
import { timeAgo } from '@/lib/utils';
import { getStorage } from '@/lib/storage';

export default async function GalleriesPage() {
  const ctx = await requireContext();
  const galleries = await prisma.gallery.findMany({
    where: { tenantId: ctx.tenant.id },
    include: {
      proposal: { select: { title: true } },
      items: { include: { file: true }, take: 6, orderBy: { sortOrder: 'asc' } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Resolve storage URLs server-side. publicUrl() returns a signed URL for
  // private S3/R2 buckets and a public CDN URL for the local driver. This
  // replaces the previous hardcoded `/uploads/<key>` which broke on S3/R2.
  const storage = getStorage();
  const thumbUrlByItem = new Map<string, string>();
  await Promise.all(
    galleries.flatMap((g) =>
      g.items.map(async (it) => {
        if (!it.file.storageKey) return;
        try {
          const url = await storage.publicUrl(it.file.storageKey);
          thumbUrlByItem.set(it.id, url);
        } catch {
          /* leave unset; <img src=""> renders nothing */
        }
      })
    )
  );

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Galleries</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Share photo galleries with clients — they can approve / request more.
            </p>
          </div>
          <GalleriesActions />
        </div>

        {galleries.length === 0 ? (
          <div className="card p-12 text-center">
            <Images className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No galleries yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Create one to upload images for a client.
            </p>
            <div className="mt-4">
              <GalleriesActions />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {galleries.map((g) => (
              <Link
                key={g.id}
                href={`/app/galleries/${g.id}`}
                className="card p-0 hover:border-[var(--color-primary)]/60 transition overflow-hidden"
              >
                <div className="grid grid-cols-3 gap-px bg-[var(--color-border)] aspect-[3/2]">
                  {g.items.slice(0, 6).map((it) => (
                    <div key={it.id} className="bg-[var(--color-surface-2)] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbUrlByItem.get(it.id) ?? ''} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                  {g.items.length === 0 && (
                    <div className="col-span-3 bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-muted)] text-sm">
                      Empty
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-semibold truncate">{g.title}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-1">
                    {g._count.items} item{g._count.items === 1 ? '' : 's'} ·{' '}
                    {g.proposal?.title ?? 'No proposal'} · {timeAgo(g.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
