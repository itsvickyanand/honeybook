'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function DocumentsClient() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [category, setCategory] = React.useState<'CONTRACT' | 'VISA' | 'OTHER'>('CONTRACT');
  const [saving, setSaving] = React.useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, category, status: 'DRAFT' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Document added');
      setOpen(false);
      setTitle('');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New document</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New document">
        <div className="space-y-3">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as 'CONTRACT' | 'VISA' | 'OTHER')}>
            <option value="CONTRACT">Contract</option>
            <option value="VISA">Visa document</option>
            <option value="OTHER">Other</option>
          </Select>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={saving} disabled={!title.trim()}>Create</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
