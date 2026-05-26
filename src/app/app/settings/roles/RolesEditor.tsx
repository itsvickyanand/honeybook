'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';

interface Role { id?: string; name: string; description: string | null; isSystem: boolean; permissions: string[] }

export function RolesEditor({
  allPermissions, initialRoles,
}: { allPermissions: [string, string][]; initialRoles: Role[] }) {
  const router = useRouter();
  const [roles, setRoles] = React.useState(initialRoles);
  const [open, setOpen] = React.useState(false);

  async function save(role: Role) {
    try {
      if (role.id) {
        const res = await fetch(`/api/roles/${role.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: role.name, description: role.description, permissions: role.permissions }),
        });
        if (!res.ok) throw new Error('Failed');
      } else {
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: role.name, description: role.description, permissions: role.permissions }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        role.id = data.role.id;
      }
      toast.success('Saved');
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: string) {
    if (!confirm('Delete this role?')) return;
    const res = await fetch(`/api/roles/${id}`, { method: 'DELETE' });
    if (!res.ok) { const j = await res.json(); return toast.error(j.error); }
    setRoles((r) => r.filter((x) => x.id !== id));
    toast.success('Deleted');
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New role</Button>
      </div>
      {roles.map((r) => (
        <RoleCard
          key={r.id ?? r.name}
          role={r}
          allPermissions={allPermissions}
          onSave={save}
          onDelete={r.id && !r.isSystem ? () => remove(r.id!) : undefined}
        />
      ))}
      <NewRoleModal open={open} onClose={() => setOpen(false)} allPermissions={allPermissions} onCreated={(rl) => { setRoles((rs) => [...rs, rl]); save(rl); }} />
    </motion.div>
  );
}

function RoleCard({ role: initial, allPermissions, onSave, onDelete }: {
  role: Role;
  allPermissions: [string, string][];
  onSave: (r: Role) => void;
  onDelete?: () => void;
}) {
  const [role, setRole] = React.useState(initial);
  const dirty = JSON.stringify(role.permissions) !== JSON.stringify(initial.permissions) || role.name !== initial.name;

  function toggle(p: string) {
    setRole((r) => {
      const set = new Set(r.permissions);
      if (set.has(p)) set.delete(p);
      else set.add(p);
      return { ...r, permissions: [...set] };
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3 mb-3">
        <Input value={role.name} onChange={(e) => setRole({ ...role, name: e.target.value })} disabled={role.isSystem} className="font-semibold" />
        {role.isSystem && <span className="chip">System</span>}
        {onDelete && <button onClick={onDelete} className="btn-ghost p-2 text-red-400"><Trash2 className="h-4 w-4" /></button>}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {allPermissions.map(([p, label]) => (
          <label key={p} className={`flex items-start gap-2 rounded-xl border p-2 cursor-pointer text-sm transition ${role.permissions.includes(p) || role.permissions.includes('*') ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/5' : 'bg-[var(--color-surface-2)]'} ${role.isSystem ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="checkbox"
              disabled={role.isSystem}
              checked={role.permissions.includes(p) || (p !== '*' && role.permissions.includes('*'))}
              onChange={() => !role.isSystem && toggle(p)}
              className="mt-0.5"
            />
            <div>
              <div className="font-mono text-xs">{p}</div>
              <div className="text-xs text-[var(--color-muted)]">{label}</div>
            </div>
          </label>
        ))}
      </div>
      {!role.isSystem && dirty && (
        <div className="mt-3 flex justify-end">
          <Button onClick={() => onSave(role)}><Save className="h-4 w-4" /> Save</Button>
        </div>
      )}
    </div>
  );
}

function NewRoleModal({
  open, onClose, allPermissions, onCreated,
}: { open: boolean; onClose: () => void; allPermissions: [string, string][]; onCreated: (r: Role) => void }) {
  const [name, setName] = React.useState('');
  const [perms, setPerms] = React.useState<string[]>(['catalog.view', 'proposal.view']);

  function toggle(p: string) {
    setPerms((arr) => arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p]);
  }

  function submit() {
    if (!name.trim() || perms.length === 0) return;
    onCreated({ name, description: null, permissions: perms, isSystem: false });
    setName(''); setPerms(['catalog.view', 'proposal.view']);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Create role" size="lg">
      <Input label="Role name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {allPermissions.map(([p, label]) => (
          <label key={p} className="flex items-start gap-2 text-sm cursor-pointer rounded-xl border bg-[var(--color-surface-2)] p-2">
            <input type="checkbox" checked={perms.includes(p)} onChange={() => toggle(p)} className="mt-0.5" />
            <div>
              <div className="font-mono text-xs">{p}</div>
              <div className="text-xs text-[var(--color-muted)]">{label}</div>
            </div>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={!name.trim()}>Create</Button>
      </div>
    </Modal>
  );
}
