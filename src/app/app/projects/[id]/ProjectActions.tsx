'use client';

/**
 * Workspace action bar buttons: Attach · AI actions · Create file.
 * (Schedule is a plain link in the page; this groups the interactive actions.)
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Paperclip, Sparkles, FilePlus, ChevronDown, Loader2 } from 'lucide-react';

export function ProjectActions({ projectId }: { projectId: string }) {
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);

  async function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      // presign → PUT → register Document tied to the project
      const pres = await fetch('/api/files/sign-upload', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream', prefix: 'project' }),
      });
      const pd = await pres.json();
      if (!pres.ok) throw new Error(pd.error ?? 'Presign failed');
      await fetch(pd.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type || 'application/octet-stream', ...(pd.headers ?? {}) }, body: file });
      const reg = await fetch(`/api/projects/${projectId}/files`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageKey: pd.storageKey, filename: file.name, mimeType: file.type, bytes: file.size }),
      });
      if (!reg.ok) throw new Error('Could not attach');
      toast.success('File attached');
      router.refresh();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  return (
    <div className="flex items-center gap-2">
      <input ref={fileRef} type="file" className="hidden" onChange={onAttach} />
      <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-ghost text-sm">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Attach
      </button>

      <div className="relative">
        <button onClick={() => { setAiOpen((o) => !o); setCreateOpen(false); }} className="btn-ghost text-sm">
          <Sparkles className="h-4 w-4 text-[var(--color-primary-soft)]" /> AI actions <ChevronDown className="h-3 w-3" />
        </button>
        {aiOpen && (
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm shadow-xl">
            <Link href={`/app/proposals/new?project=${projectId}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Draft a proposal with AI</Link>
            <Link href={`/app/projects/${projectId}?tab=activity`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Summarize this project</Link>
            <Link href={`/app/projects/${projectId}?tab=activity`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Draft a client email</Link>
          </div>
        )}
      </div>

      <div className="relative">
        <button onClick={() => { setCreateOpen((o) => !o); setAiOpen(false); }} className="btn-primary text-sm">
          <FilePlus className="h-4 w-4" /> Create file <ChevronDown className="h-3 w-3" />
        </button>
        {createOpen && (
          <div className="absolute right-0 z-20 mt-2 w-52 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm shadow-xl">
            <Link href={`/app/proposals/new?project=${projectId}`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Proposal</Link>
            <Link href={`/app/projects/${projectId}?tab=financials`} className="block rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]">Invoice</Link>
            <button onClick={() => fileRef.current?.click()} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--color-surface-2)]">Upload a file</button>
          </div>
        )}
      </div>
    </div>
  );
}
