'use client';

/**
 * Workspace participants bar — "Visible to you + N participant" with avatar chips
 * and an Add ▾ menu offering the three HoneyBook participant kinds:
 *   Contact · Collaborator · Team member
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X, UserPlus, Copy, Check } from 'lucide-react';

export interface ParticipantRow {
  id: string;
  kind: 'TEAM' | 'COLLABORATOR' | 'CONTACT';
  role: string;
  name: string;
  email: string | null;
  initials: string;
  accessToken: string | null;
}

const KIND_LABEL: Record<string, string> = { TEAM: 'TEAM', COLLABORATOR: 'COLLABORATOR', CONTACT: 'CONTACT' };
const KIND_TONE: Record<string, string> = {
  TEAM: 'bg-[var(--color-primary)]/15 text-[var(--color-primary-soft)]',
  COLLABORATOR: 'bg-amber-500/15 text-amber-500',
  CONTACT: 'bg-blue-500/15 text-blue-400',
};

export function ParticipantsBar({
  projectId,
  youName,
  initial,
  users,
  contacts,
}: {
  projectId: string;
  youName: string;
  initial: ParticipantRow[];
  users: { id: string; fullName: string; email: string }[];
  contacts: { id: string; fullName: string; email: string | null }[];
}) {
  const router = useRouter();
  const [list, setList] = React.useState<ParticipantRow[]>(initial);
  const [menu, setMenu] = React.useState(false);
  const [mode, setMode] = React.useState<null | 'CONTACT' | 'COLLABORATOR' | 'TEAM'>(null);
  const [collabLink, setCollabLink] = React.useState<string | null>(null);

  async function add(body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/projects/${projectId}/participants`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setList((p) => [...p.filter((x) => x.id !== data.participant.id), data.participant]);
      setMode(null); setMenu(false);
      if (data.portalUrl) { setCollabLink(data.portalUrl); }
      toast.success('Participant added');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: string) {
    setList((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/projects/${projectId}/participants?memberId=${id}`, { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  return (
    <div>
      <div className="text-sm text-[var(--color-muted)]">Visible to you + {list.length} participant{list.length === 1 ? '' : 's'}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Avatar initials={(youName || 'You').slice(0, 1).toUpperCase()} label="You" />
        {list.map((p) => (
          <div key={p.id} className="group relative flex items-center gap-2">
            <Avatar initials={p.initials} label={p.name} sub={KIND_LABEL[p.kind]} tone={KIND_TONE[p.kind]} />
            <button onClick={() => remove(p.id)} className="absolute -right-1 -top-1 hidden rounded-full bg-[var(--color-surface-2)] p-0.5 text-[var(--color-muted)] group-hover:block" aria-label={`Remove ${p.name}`}>
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="relative">
          <button onClick={() => { setMenu((m) => !m); setMode(null); }} className="flex items-center gap-2 rounded-full border border-dashed border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] transition hover:border-[var(--color-primary)]/60 hover:text-[var(--color-text)]">
            <Plus className="h-4 w-4" /> Add
          </button>
          {menu && !mode && (
            <div className="absolute z-20 mt-2 w-72 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl">
              <MenuItem title="Contact" desc="Anyone you offer your services to — an individual or a business." onClick={() => setMode('CONTACT')} />
              <MenuItem title="Collaborator" desc="An individual or business that helps you provide your service." onClick={() => setMode('COLLABORATOR')} />
              <MenuItem title="Team member" desc="An individual who's part of your company and has account access." onClick={() => setMode('TEAM')} />
            </div>
          )}
          {menu && mode && (
            <div className="absolute z-20 mt-2 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-xl">
              {mode === 'CONTACT' && <ContactForm contacts={contacts} onSubmit={(b) => add({ kind: 'CONTACT', ...b })} onCancel={() => setMode(null)} />}
              {mode === 'COLLABORATOR' && <CollaboratorForm onSubmit={(b) => add({ kind: 'COLLABORATOR', ...b })} onCancel={() => setMode(null)} />}
              {mode === 'TEAM' && <TeamForm users={users} taken={list} onSubmit={(b) => add({ kind: 'TEAM', ...b })} onCancel={() => setMode(null)} />}
            </div>
          )}
        </div>
      </div>

      {collabLink && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
          <span className="text-[var(--color-muted)]">Collaborator link:</span>
          <code className="truncate">{collabLink}</code>
          <button onClick={() => { navigator.clipboard.writeText(collabLink); toast.success('Copied'); }} className="btn-ghost px-2 py-1"><Copy className="h-3 w-3" /></button>
          <button onClick={() => setCollabLink(null)} className="btn-ghost px-2 py-1"><Check className="h-3 w-3" /></button>
        </div>
      )}
    </div>
  );
}

function Avatar({ initials, label, sub, tone }: { initials: string; label: string; sub?: string; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${tone ?? 'bg-[var(--color-surface-2)] text-[var(--color-text)]'}`}>{initials}</div>
      <div className="leading-tight">
        <div className="text-sm">{label.length > 18 ? label.slice(0, 17) + '…' : label}</div>
        {sub && <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{sub}</div>}
      </div>
    </div>
  );
}

function MenuItem({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[var(--color-surface-2)]">
      <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-3.5 w-3.5 text-[var(--color-muted)]" /> {title}</div>
      <div className="ml-5 text-xs text-[var(--color-muted)]">{desc}</div>
    </button>
  );
}

function ContactForm({ contacts, onSubmit, onCancel }: { contacts: { id: string; fullName: string; email: string | null }[]; onSubmit: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [contactId, setContactId] = React.useState('');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Add a contact</div>
      {contacts.length > 0 && (
        <select value={contactId} onChange={(e) => setContactId(e.target.value)} className="input-base text-sm">
          <option value="">— New contact —</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.email ? ` · ${c.email}` : ''}</option>)}
        </select>
      )}
      {!contactId && (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="input-base text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="input-base text-sm" />
        </>
      )}
      <Actions onCancel={onCancel} onSave={() => onSubmit(contactId ? { contactId } : { name, email: email || undefined })} disabled={!contactId && !name} />
    </div>
  );
}

function CollaboratorForm({ onSubmit, onCancel }: { onSubmit: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Invite a collaborator</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="input-base text-sm" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input-base text-sm" />
      <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email them their workspace link
      </label>
      <Actions onCancel={onCancel} onSave={() => onSubmit({ name, email: email || undefined, notify })} disabled={!name && !email} />
    </div>
  );
}

function TeamForm({ users, taken, onSubmit, onCancel }: { users: { id: string; fullName: string; email: string }[]; taken: ParticipantRow[]; onSubmit: (b: Record<string, unknown>) => void; onCancel: () => void }) {
  const [userId, setUserId] = React.useState('');
  const available = users; // upsert handles dupes
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Add a team member</div>
      <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-base text-sm">
        <option value="">Select a teammate…</option>
        {available.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}
      </select>
      <Actions onCancel={onCancel} onSave={() => onSubmit({ userId })} disabled={!userId} />
    </div>
  );
}

function Actions({ onCancel, onSave, disabled }: { onCancel: () => void; onSave: () => void; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button onClick={onCancel} className="btn-ghost text-xs">Cancel</button>
      <button onClick={onSave} disabled={disabled} className="btn-primary text-xs disabled:opacity-50">Add</button>
    </div>
  );
}
