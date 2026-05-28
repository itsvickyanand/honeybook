import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { GalleryEditor } from './GalleryEditor';
import { getStorage } from '@/lib/storage';

export default async function GalleryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const gallery = await prisma.gallery.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      items: { include: { file: true }, orderBy: { sortOrder: 'asc' } },
      proposal: { select: { id: true, title: true, shareToken: true } },
    },
  });
  if (!gallery) notFound();

  // Resolve storage URLs server-side (signed for private S3/R2, public for local).
  const storage = getStorage();
  const urlByItem = new Map<string, string>();
  await Promise.all(
    gallery.items.map(async (it) => {
      if (!it.file.storageKey) return;
      try {
        const u = await storage.publicUrl(it.file.storageKey);
        urlByItem.set(it.id, u);
      } catch {
        /* swallow — leave URL undefined */
      }
    })
  );

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <Link href="/app/galleries" className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to galleries
        </Link>
        <GalleryEditor
          galleryId={gallery.id}
          title={gallery.title}
          description={gallery.description}
          proposal={gallery.proposal}
          items={gallery.items.map((it) => ({
            id: it.id,
            fileId: it.fileId,
            url: urlByItem.get(it.id) ?? '',
            filename: it.file.filename,
            approved: it.approved,
            clientNote: it.clientNote,
          }))}
        />
      </div>
    </PageTransition>
  );
}
