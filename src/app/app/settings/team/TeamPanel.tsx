'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, UserPlus, Trash2, Mail, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { timeAgo } from '@/lib/utils';

interface User { id: string; fullName: string; email: string; roleId: string; roleName: string; status: string }
interface Role { id: string; name: string }
interface Invite { id: string; email: string; fullName: string | null; roleId: string; expiresAt: string; token: string }

export function TeamPanel({
  currentUserId, users: initialUsers, roles, invites: initialInvites,
}: {
  currentUserId: string;
  users: User[];
  roles: Role[];
  invites: Invite[];
}) {
  const router = useRouter();
  const [users, setUsers] = React.useState(initialUsers);
  const [invites, setInvites] = React.useState(initialInvites);
  const [open, setOpen] = React.useState(false);

  async function changeRole(userId: string, roleId: string) {
    const res = await fetch(`/api/team/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roleId }),
    });
    if (!res.ok) return toast.error('Failed');
    const role = roles.find((r) => r.id === roleId);
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, roleId, roleName: role?.name ?? x.roleName } : x)));
    toast.success('Role updated');
  }

  async function suspend(userId: string) {
    if (!confirm('Suspend this user? They lose access immediately.')) return;
    const res = await fetch(`/api/team/users/${userId}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Failed');
    setUsers((u) => u.map((x) => (x.id === userId ? { ...x, status: 'SUSPENDED' } : x)));
    toast.success('User suspended');
  }

  function copyInvite(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  }

  return (
    <>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold">Team</h1>
          <p className="mt-1 text-[var(--color-muted)]">Invite teammates and manage their roles.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4" /> Invite teammate
        </Button>
      </div>

      {invites.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold mb-4 text-sm uppercase tracking-wider text-[var(--color-muted)]">Pending invites</h2>
          <div className="space-y-2">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 rounded-xl border bg-[var(--color-surface-2)] p-3">
                <Mail className="h-4 w-4 text-[var(--color-muted)]" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{i.email}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    Expires {timeAgo(i.expiresAt)} · {roles.find((r) => r.id === i.roleId)?.name ?? '—'}
                  </div>
                </div>
                <button onClick={() => copyInvite(i.token)} className="btn-ghost p-2" aria-label="Copy link">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold mb-4">Active team</h2>
        <div className="space-y-2">
          <AnimatePresence>
            {users.map((u) => (
              <motion.div
                key={u.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-xl border bg-[var(--color-surface-2)] p-3"
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-sm font-semibold">
                  {u.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.fullName} {u.id === currentUserId && <span className="text-xs text-[var(--color-muted)]">(you)</span>}</div>
                  <div className="text-xs text-[var(--color-muted)] truncate">{u.email}</div>
                </div>
                {u.status === 'SUSPENDED' ? (
                  <span className="chip">Suspended</span>
                ) : (
                  <Select
                    value={u.roleId}
                    onChange={(e) => changeRole(u.id, e.target.value)}
                    disabled={u.id === currentUserId}
                    className="max-w-[140px]"
                  >
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                )}
                {u.id !== currentUserId && u.status !== 'SUSPENDED' && (
                  <button onClick={() => suspend(u.id)} className="btn-ghost p-2 text-red-400" aria-label="Suspend">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <InviteModal open={open} onClose={() => setOpen(false)} roles={roles} onCreated={(i) => { setInvites((x) => [i, ...x]); router.refresh(); }} />
    </>
  );
}

function InviteModal({ open, onClose, roles, onCreated }: {
  open: boolean;
  onClose: () => void;
  roles: Role[];
  onCreated: (invite: Invite) => void;
}) {
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [roleId, setRoleId] = React.useState(roles.find((r) => r.name === 'Sales')?.id ?? roles[0]?.id ?? '');
  const [saving, setSaving] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/team/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, fullName, roleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Invite sent');
      // Copy invite URL to clipboard for convenience
      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl).catch(() => {});
        toast.message('Invite link copied to clipboard');
      }
      onCreated({
        id: data.invite.id,
        email: data.invite.email,
        fullName,
        roleId,
        expiresAt: data.invite.expiresAt,
        token: data.inviteUrl?.split('/').pop() ?? '',
      });
      setEmail(''); setFullName('');
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite a teammate">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <Input label="Their name (optional)" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Select label="Role" value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!email || !roleId}>
            <Plus className="h-4 w-4" /> Send invite
          </Button>
        </div>
      </form>
    </Modal>
  );
}
