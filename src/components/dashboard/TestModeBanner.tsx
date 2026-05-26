'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, X } from 'lucide-react';
import Link from 'next/link';

const KEY = 'hb_dismiss_testmode_v2';

/**
 * Dismissal is scoped to the *exact set* of currently mocked integrations.
 * If a new integration enters mock mode (e.g. you remove a key) the banner re-shows.
 */
function fingerprint(list: string[]): string {
  return [...list].sort().join('|');
}

export function TestModeBanner({ mocked }: { mocked: string[] }) {
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    if (mocked.length === 0) { setDismissed(true); return; }
    const stored = localStorage.getItem(KEY);
    setDismissed(stored === fingerprint(mocked));
  }, [mocked]);

  function dismiss() {
    localStorage.setItem(KEY, fingerprint(mocked));
    setDismissed(true);
  }

  if (mocked.length === 0 || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -40, opacity: 0 }}
        className="sticky top-0 z-40 border-b border-amber-500/30 bg-amber-500/10 backdrop-blur"
      >
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-center gap-3 text-sm">
          <FlaskConical className="h-4 w-4 text-amber-300 shrink-0" />
          <span className="text-amber-100">
            <strong>Test mode</strong> — these integrations are mocked: {mocked.join(', ')}.
          </span>
          <Link
            href="/app/settings/integrations"
            className="ml-auto text-amber-200 hover:text-white underline-offset-2 hover:underline text-xs"
          >
            Configure
          </Link>
          <button onClick={dismiss} className="text-amber-200 hover:text-white" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
