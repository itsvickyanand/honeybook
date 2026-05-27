'use client';
import * as React from 'react';
import { Mail, MessageSquare, Phone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Textarea, Select } from './Input';

export interface SendContext {
  contactName?: string;
  email?: string;
  phone?: string;
  contactId?: string;
  proposalId?: string;
  invoiceId?: string;
  defaultSubject?: string;
  defaultBody?: string;
}

/**
 * Drop-in dropdown button: Email · SMS · WhatsApp.
 * Opens a modal pre-filled with whatever channel the user picked.
 */
export function SendMessageMenu({ ctx, variant = 'secondary' }: { ctx: SendContext; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState<'email' | 'sms' | 'whatsapp'>('email');
  const [to, setTo] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function start(c: 'email' | 'sms' | 'whatsapp') {
    setChannel(c);
    if (c === 'email') setTo(ctx.email ?? '');
    else setTo(ctx.phone ?? '');
    setSubject(ctx.defaultSubject ?? `Message from your project team`);
    setBody(ctx.defaultBody ?? `Hi ${ctx.contactName ?? 'there'},\n\n`);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel, to, subject: channel === 'email' ? subject : undefined, body,
          contactId: ctx.contactId, proposalId: ctx.proposalId, invoiceId: ctx.invoiceId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success(`${channel.toUpperCase()} sent`);
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="inline-flex rounded-xl border bg-[var(--color-surface-2)] divide-x">
        <button
          onClick={() => start('email')}
          disabled={!ctx.email}
          className={`px-3 py-2 inline-flex items-center gap-1.5 text-sm transition ${variant === 'primary' ? 'text-white' : 'text-[var(--color-muted)] hover:text-white'} disabled:opacity-40 disabled:cursor-not-allowed`}
          title={ctx.email ? 'Email' : 'No email on file'}
        >
          <Mail className="h-3.5 w-3.5" /> Email
        </button>
        <button
          onClick={() => start('whatsapp')}
          disabled={!ctx.phone}
          className="px-3 py-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={ctx.phone ? 'WhatsApp' : 'No phone on file'}
        >
          <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
        </button>
        <button
          onClick={() => start('sms')}
          disabled={!ctx.phone}
          className="px-3 py-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
          title={ctx.phone ? 'SMS' : 'No phone on file'}
        >
          <Phone className="h-3.5 w-3.5" /> SMS
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Send via ${channel.toUpperCase()}`} size="md">
        <form onSubmit={submit} className="space-y-3">
          <Select label="Channel" value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'sms' | 'whatsapp')}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
          </Select>
          <Input
            label={channel === 'email' ? 'To (email)' : 'To (phone, +91…)'}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
          {channel === 'email' && (
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />
          )}
          <Textarea label="Message" value={body} onChange={(e) => setBody(e.target.value)} required className="min-h-[140px]" />
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saving} disabled={!to.trim() || !body.trim()}>
              <Send className="h-4 w-4" /> Send
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
