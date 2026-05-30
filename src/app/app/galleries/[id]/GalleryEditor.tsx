'use client';
import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ExternalLink } from 'lucide-react';
import { FileUpload } from '@/components/ui/FileUpload';

interface Item {
  id: string;
  fileId: string;
  url: string;
  filename: string;
  approved: boolean | null;
  clientNote: string | null;
}

export function GalleryEditor({
  galleryId, title, description, proposal, items: initialItems,
}: {
  galleryId: string;
  title: string;
  description: string | null;
  proposal: { id: string; title: string; shareToken: string } | null;
  items: Item[];
}) {
  const [items, setItems] = React.useState(initialItems);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold">{title}</h1>
          {description && <p className="mt-1 text-[var(--color-muted)]">{description}</p>}
          {proposal && (
            <Link href={`/p/${proposal.shareToken}`} target="_blank" className="chip mt-2 hover:border-[var(--color-primary)]/60 transition">
              {proposal.title} <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <span className="chip">{items.length} items · {items.filter((i) => i.approved).length} approved</span>
      </div>

      <FileUpload
        accept="image/*"
        multiple
        prefix="galleries"
        galleryId={galleryId}
        onUploaded={(f) => setItems((prev) => [...prev, {
          id: `temp-${f.id}`, fileId: f.id, url: f.url, filename: f.filename, approved: null, clientNote: null,
        }])}
        className="mb-6"
      />

      {items.length === 0 ? (
        <div className="card p-12 text-center text-sm text-[var(--color-muted)]">
          Upload images above — they&apos;ll appear here.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <AnimatePresence>
            {items.map((it) => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="card p-0 overflow-hidden"
              >
                <div className="aspect-square bg-[var(--color-surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt={it.filename} className="h-full w-full object-cover" />
                </div>
                <div className="px-3 py-2 flex items-center justify-between text-xs">
                  <span className="truncate">{it.filename}</span>
                  {it.approved === true ? (
                    <span className="text-emerald-400" title="Approved by client"><Check className="h-3 w-3" /></span>
                  ) : it.approved === false ? (
                    <span className="text-red-400" title="Rejected by client"><X className="h-3 w-3" /></span>
                  ) : null}
                </div>
                {it.clientNote && (
                  <p className="px-3 pb-2 text-xs italic text-[var(--color-muted)] line-clamp-2">“{it.clientNote}”</p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
