'use client';
import * as React from 'react';
import { History } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CallButton, CallHistory } from '@/components/calling';

/**
 * Call actions for a Client's detail page: a one-click Call button (when a phone
 * number exists) plus a "Call history" button that opens the recording /
 * transcript / AI-analysis log for this contact.
 */
export function ContactCallActions({
  contactId,
  name,
  phone,
  company,
}: {
  contactId: string;
  name: string;
  phone?: string | null;
  company?: string | null;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="inline-flex rounded-xl border bg-[var(--color-surface-2)] divide-x">
        {phone && (
          <CallButton
            variant="group"
            phone={phone}
            name={name}
            company={company ?? undefined}
            contactId={contactId}
          />
        )}
        <button
          type="button"
          className="px-3 py-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-white transition"
          onClick={() => setOpen(true)}
        >
          <History className="h-3.5 w-3.5" /> Call history
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={`Calls — ${name}`} size="lg">
        <CallHistory contactId={contactId} className="max-h-[60vh] overflow-y-auto" />
      </Modal>
    </>
  );
}
