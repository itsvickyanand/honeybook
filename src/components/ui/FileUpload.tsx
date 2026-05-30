'use client';
import * as React from 'react';
import { Upload, Loader2, X, FileText, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

export interface UploadedFile {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  bytes: number;
}

/**
 * Drag-drop file upload widget.
 * Uses the sign-upload → PUT → confirm flow.
 */
export function FileUpload({
  prefix,
  multiple = false,
  accept,
  galleryId,
  onUploaded,
  className,
  compact,
}: {
  prefix?: string;
  multiple?: boolean;
  accept?: string;
  galleryId?: string;
  onUploaded?: (file: UploadedFile) => void;
  className?: string;
  compact?: boolean;
}) {
  const [drag, setDrag] = React.useState(false);
  const [uploads, setUploads] = React.useState<{ id: string; name: string; progress: number; done?: boolean; error?: boolean }[]>([]);

  async function uploadFile(file: File) {
    const localId = Math.random().toString(36).slice(2);
    setUploads((u) => [...u, { id: localId, name: file.name, progress: 0 }]);

    try {
      // 1. ask server for a presigned URL
      const signRes = await fetch('/api/files/sign-upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          prefix,
        }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) throw new Error(signed.error ?? 'sign failed');

      // 2. upload the bytes
      const putRes = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error(`upload failed: ${putRes.status}`);
      setUploads((u) => u.map((x) => (x.id === localId ? { ...x, progress: 80 } : x)));

      // 3. confirm
      const confirmRes = await fetch('/api/files/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storageKey: signed.storageKey,
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          bytes: file.size,
          galleryId,
        }),
      });
      const confirmed = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmed.error ?? 'confirm failed');

      setUploads((u) => u.map((x) => (x.id === localId ? { ...x, progress: 100, done: true } : x)));
      onUploaded?.({
        id: confirmed.file.id,
        filename: confirmed.file.filename,
        url: confirmed.file.url,
        mimeType: confirmed.file.mimeType,
        bytes: confirmed.file.bytes,
      });
      // remove from list after a beat
      setTimeout(() => setUploads((u) => u.filter((x) => x.id !== localId)), 1500);
    } catch (e) {
      setUploads((u) => u.map((x) => (x.id === localId ? { ...x, error: true, progress: 0 } : x)));
      toast.error(`Upload failed: ${(e as Error).message}`);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(uploadFile);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const files = e.dataTransfer.files;
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  }

  if (compact) {
    return (
      <label className={`inline-flex items-center gap-2 cursor-pointer btn-secondary ${className ?? ''}`}>
        <Upload className="h-4 w-4" /> Upload
        <input type="file" multiple={multiple} accept={accept} onChange={onPick} className="hidden" />
      </label>
    );
  }

  return (
    <div className={className}>
      <label
        onDragEnter={() => setDrag(true)}
        onDragLeave={() => setDrag(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`card flex flex-col items-center justify-center p-8 cursor-pointer border-dashed transition ${
          drag ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''
        }`}
      >
        <Upload className="h-8 w-8 text-[var(--color-muted)] mb-2" />
        <span className="text-sm font-medium">Drop files here or click to upload</span>
        <span className="mt-1 text-xs text-[var(--color-muted)]">{accept ?? 'Any file type'}</span>
        <input type="file" multiple={multiple} accept={accept} onChange={onPick} className="hidden" />
      </label>

      <AnimatePresence>
        {uploads.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            {uploads.map((u) => (
              <div key={u.id} className="card p-3 flex items-center gap-3">
                {u.error ? <X className="h-4 w-4 text-red-400" /> :
                  u.done ? <ImageIcon className="h-4 w-4 text-emerald-400" /> :
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary-soft)]" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{u.name}</div>
                  <div className="mt-1 h-1 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] transition-all"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
