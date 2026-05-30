'use client';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Mail, Phone, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import Link from 'next/link';

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  notes: string | null;
  proposalCount: number;
}

export function ContactsPanel({
  canEdit,
  initialContacts,
}: {
  canEdit: boolean;
  initialContacts: Contact[];
}) {
  const [contacts, setContacts] = React.useState(initialContacts);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    fullName: '',
    email: '',
    phone: '',
    company: '',
    source: '',
    notes: '',
  });
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setContacts((c) => [{ ...data.contact, proposalCount: 0 }, ...c]);
      setOpen(false);
      setForm({ fullName: '', email: '', phone: '', company: '', source: '', notes: '' });
      toast.success('Client added');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Clients</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            People you&apos;ve sent proposals to or are working with.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New client
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
          <h3 className="mt-3 font-semibold">No clients yet</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Add a client manually or they&apos;ll auto-appear when you generate a proposal.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {contacts.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
              ><Link href={`/app/contacts/${c.id}`} className="card p-5 block hover:border-[var(--color-primary)]/60 transition">
                <div className="flex items-start gap-3">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-sm font-semibold">
                    {c.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{c.fullName}</div>
                    {c.company && (
                      <div className="text-xs text-[var(--color-muted)]">{c.company}</div>
                    )}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-[var(--color-muted)]">
                  {c.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  {c.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{c.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    {c.proposalCount} proposals
                  </div>
                </div>
                {c.notes && (
                  <p className="mt-3 pt-3 border-t text-xs text-[var(--color-muted)] line-clamp-3">
                    {c.notes}
                  </p>
                )}
              </Link></motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a client">
        <form onSubmit={submit} className="space-y-3">
          <Input label="Full name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} autoFocus />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <Input label="Source" placeholder="e.g. instagram, referral" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          <Textarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!form.fullName.trim()}>Add</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
