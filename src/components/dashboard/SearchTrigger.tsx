'use client';
import * as React from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface Hit { kind: string; id: string; title: string; subtitle?: string; href: string }

export function SearchTrigger() {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [hits, setHits] = React.useState<Hit[]>([]);
  const router = useRouter();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    if (!open || !q.trim()) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((d) => setHits(d.hits ?? []))
      .catch(() => {/* aborted */});
    return () => ctl.abort();
  }, [open, q]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border bg-[var(--color-surface-2)] px-3 py-1.5 text-sm text-[var(--color-muted)] hover:border-[var(--color-primary)]/40 transition w-full max-w-md"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Search anything…</span>
        <kbd className="text-xs opacity-60">⌘K</kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ y: 16, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 16, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-xl card p-0 overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 border-b">
                <Search className="h-4 w-4 text-[var(--color-muted)]" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoFocus
                  placeholder="Search clients, proposals, invoices, catalog…"
                  className="flex-1 bg-transparent outline-none text-sm"
                />
                <kbd className="text-xs text-[var(--color-muted)]">esc</kbd>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {hits.length === 0 ? (
                  <div className="p-6 text-center text-sm text-[var(--color-muted)]">
                    {q.trim() ? 'No results.' : 'Type to search…'}
                  </div>
                ) : (
                  hits.map((h) => (
                    <Link
                      key={`${h.kind}-${h.id}`}
                      href={h.href}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2.5 hover:bg-[var(--color-surface-2)] border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="chip text-xs">{h.kind}</span>
                        <span className="font-medium truncate">{h.title}</span>
                      </div>
                      {h.subtitle && <div className="text-xs text-[var(--color-muted)] mt-0.5 truncate">{h.subtitle}</div>}
                    </Link>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
