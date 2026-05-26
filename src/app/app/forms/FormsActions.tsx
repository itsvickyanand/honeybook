'use client';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

export function FormsActions() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function create() {
    setSaving(true);
    try {
      const res = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Get a quote',
          title: name || 'Get a quote',
          fields: [
            { name: 'name', label: 'Your name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Phone', type: 'phone' },
            { name: 'message', label: 'What do you need?', type: 'textarea', required: true },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Form created');
      setOpen(false);
      router.push(`/app/forms/${data.form.id}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New form
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Create lead form">
        <p className="text-sm text-[var(--color-muted)] mb-3">We&apos;ll start with a default set of fields. You can edit them next.</p>
        <Input label="Form name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={create} loading={saving}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
