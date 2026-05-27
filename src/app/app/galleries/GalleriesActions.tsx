'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function GalleriesActions() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch('/api/galleries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: title || 'Untitled gallery' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Gallery created');
      setOpen(false);
      router.push(`/app/galleries/${data.gallery.id}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New gallery</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create gallery">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} loading={saving}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
