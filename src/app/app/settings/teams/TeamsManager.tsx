'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, X, Crown, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface UserLite { id: string; fullName: string; email: string }
interface Member { userId: string; teamRole: string; fullName: string; email: string }
interface Team {
  id: string; name: string; description: string | null; color: string;
  leadUserId: string | null; projectCount: number; members: Member[];
}

export function TeamsManager({ users, initialTeams }: { users: UserLite[]; initialTeams: Team[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function createTeam() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      setNewName(''); setCreating(false); router.refresh();
      toast.success('Team created');
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function addMember(teamId: string, userId: string) {
    if (!userId) return;
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { toast.error('Could not add member'); }
  }
  async function removeMember(teamId: string, userId: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}/members?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch { toast.error('Could not remove'); }
  }
  async function setLead(teamId: string, userId: string) {
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ leadUserId: userId }),
      });
      if (!res.ok) throw new Error();
      router.refresh(); toast.success('Lead updated');
    } catch { toast.error('Could not set lead'); }
  }
  async function moveMember(userId: string, fromTeamId: string, toTeamId: string) {
    if (!toTeamId || toTeamId === fromTeamId) return;
    try {
      const res = await fetch(`/api/teams/${toTeamId}/members`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, fromTeamId }),
      });
      if (!res.ok) throw new Error();
      router.refresh(); toast.success('Member moved');
    } catch { toast.error('Could not move'); }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        {creating ? (
          <div className="flex items-center gap-2">
            <Input placeholder="Team name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button onClick={createTeam} loading={busy}>Create</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        ) : (
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New team</Button>
        )}
      </div>

      {initialTeams.length === 0 && (
        <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
          No teams yet. Create one to start grouping members.
        </div>
      )}

      {initialTeams.map((team) => {
        const memberIds = new Set(team.members.map((m) => m.userId));
        const available = users.filter((u) => !memberIds.has(u.id));
        return (
          <div key={team.id} className="card p-5">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: team.color }} />
              <h3 className="font-semibold">{team.name}</h3>
              <span className="chip text-xs">{team.members.length} members</span>
              {team.projectCount > 0 && <span className="chip text-xs">{team.projectCount} projects</span>}
            </div>

            <ul className="mt-3 space-y-1.5">
              {team.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    {team.leadUserId === m.userId && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                    <span>{m.fullName}</span>
                    <span className="text-xs text-[var(--color-muted)]">{m.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {team.leadUserId !== m.userId && (
                      <button onClick={() => setLead(team.id, m.userId)} className="text-xs text-[var(--color-muted)] hover:text-amber-500" title="Make lead">
                        Make lead
                      </button>
                    )}
                    {initialTeams.length > 1 && (
                      <select
                        defaultValue=""
                        onChange={(e) => moveMember(m.userId, team.id, e.target.value)}
                        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[11px]"
                        title="Move to team"
                      >
                        <option value="">Move to…</option>
                        {initialTeams.filter((t) => t.id !== team.id).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={() => removeMember(team.id, m.userId)} className="text-[var(--color-muted)] hover:text-rose-500" aria-label="Remove">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {available.length > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-[var(--color-muted)]" />
                <select
                  defaultValue=""
                  onChange={(e) => { addMember(team.id, e.target.value); e.target.value = ''; }}
                  className="input-base text-sm"
                >
                  <option value="">Add a member…</option>
                  {available.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}
                </select>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
