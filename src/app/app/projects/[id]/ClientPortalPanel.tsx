'use client';

/**
 * Sidebar "Client portal" panel — copy/send the portal link and toggle whether
 * portal links are included in files & emails.
 */
import * as React from 'react';
import { toast } from 'sonner';
import { Copy, Send, UserRound } from 'lucide-react';

export function ClientPortalPanel({ url, clientEmail }: { url: string | null; clientEmail: string | null }) {
  const [include, setInclude] = React.useState(true);
  if (!url) {
    return (
      <div className="text-sm text-[var(--color-muted)]">
        No client portal yet — it appears once a proposal is shared with the client.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1.5">
        <UserRound className="h-3.5 w-3.5 text-[var(--color-muted)]" />
        <code className="flex-1 truncate text-xs">{url}</code>
        <button onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copied'); }} className="btn-ghost px-2 py-1" aria-label="Copy portal link">
          <Copy className="h-3.5 w-3.5" />
        </button>
        <a
          href={clientEmail ? `mailto:${clientEmail}?subject=Your%20project%20portal&body=${encodeURIComponent(url)}` : url}
          className="btn-ghost px-2 py-1" aria-label="Send portal link"
        >
          <Send className="h-3.5 w-3.5" />
        </a>
      </div>
      <label className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-muted)]">Include client portal links in files and emails</span>
        <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
      </label>
    </div>
  );
}
