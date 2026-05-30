'use client';

/**
 * Files tab — "Smart files" + uploaded documents.
 *  - Proposals / Invoices show status + a viewed indicator + quick links.
 *  - Uploaded documents have a "Share with client" toggle that controls whether
 *    clients/collaborators see the file in their portal.
 */
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileText, Receipt, Paperclip, Eye } from 'lucide-react';

interface Prop { id: string; title: string; status: string }
interface Inv { id: string; number: string | null; status: string; total: number; amountPaid: number }
interface Doc { id: string; title: string; category: string; status: string; sharedWithClient: boolean; fileId: string | null }

export function WorkspaceFiles({
  projectId, proposals, invoices, documents,
}: {
  projectId: string;
  proposals: Prop[];
  invoices: Inv[];
  documents: Doc[];
}) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<Doc[]>(documents);

  async function toggleShare(d: Doc) {
    const next = !d.sharedWithClient;
    setDocs((p) => p.map((x) => (x.id === d.id ? { ...x, sharedWithClient: next } : x)));
    try {
      const res = await fetch(`/api/projects/${projectId}/files`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId: d.id, sharedWithClient: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? 'Shared with client' : 'Unshared');
    } catch {
      setDocs((p) => p.map((x) => (x.id === d.id ? { ...x, sharedWithClient: d.sharedWithClient } : x)));
      toast.error('Could not update sharing');
    }
  }

  const empty = proposals.length === 0 && invoices.length === 0 && docs.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">Smart files</div>
        {proposals.length === 0 && invoices.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No proposals or invoices yet — use “Create file”.</p>
        ) : (
          <ul className="space-y-2">
            {proposals.map((p) => (
              <li key={p.id} className="card flex items-center justify-between p-3">
                <Link href={`/app/proposals/${p.id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <FileText className="h-4 w-4 text-[var(--color-primary-soft)]" /> Proposal · {p.title}
                </Link>
                <span className="chip text-xs">{p.status}</span>
              </li>
            ))}
            {invoices.map((i) => (
              <li key={i.id} className="card flex items-center justify-between p-3">
                <Link href={`/app/invoices/${i.id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <Receipt className="h-4 w-4 text-emerald-500" /> Invoice · {i.number ?? 'Draft'}
                </Link>
                <span className="chip text-xs">{i.status.replace('_', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">Documents</div>
        {docs.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No uploaded files. Use “Attach”.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="card flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 text-[var(--color-muted)]" /> {d.title}
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                  <Eye className="h-3.5 w-3.5" /> Share with client
                  <input type="checkbox" checked={d.sharedWithClient} onChange={() => toggleShare(d)} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {empty && <p className="text-sm text-[var(--color-muted)]">No files yet.</p>}
    </div>
  );
}
