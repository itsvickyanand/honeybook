'use client';

/**
 * Workspace → Team tab. Manage the project's internal participants
 * (OWNER/COLLABORATOR/VIEWER), assign a delivery team, and set the project lead.
 */
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus, X, Crown } from 'lucide-react';

interface UserLite { id: string; fullName: string; email: string }
interface Participant { userId: string; role: string; fullName: string; email: string }
interface TeamLite { id: string; name: string }

export function TeamTab({
  projectId,
  users,
  teams,
  initialParticipants,
  currentTeamId,
  currentOwnerId,
}: {
  projectId: string;
  users: UserLite[];
  teams: TeamLite[];
  initialParticipants: Participant[];
  currentTeamId: string | null;
  currentOwnerId: string | null;
}) {
  const router = useRouter();
  const [participants, setParticipants] = React.useState(initialParticipants);
  const memberIds = new Set(participants.map((p) => p.userId));
  const available = users.filter((u) => !memberIds.has(u.id));

  async function add(userId: string) {
    if (!userId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/participants`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const u = users.find((x) => x.id === userId)!;
      setParticipants((p) => [...p, { userId, role: 'COLLABORATOR', fullName: u.fullName, email: u.email }]);
    } catch (e) { toast.error((e as Error).message); }
  }
  async function setRole(userId: string, role: string) {
    setParticipants((p) => p.map((x) => (x.userId === userId ? { ...x, role } : x)));
    await fetch(`/api/projects/${projectId}/participants`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    }).catch(() => toast.error('Could not update role'));
  }
  async function remove(userId: string) {
    setParticipants((p) => p.filter((x) => x.userId !== userId));
    await fetch(`/api/projects/${projectId}/participants?userId=${userId}`, { method: 'DELETE' }).catch(() => {});
  }
  async function patchProject(body: Record<string, unknown>) {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { toast.error('Could not update'); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h3 className="font-semibold">Participants</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">People with access to this project workspace.</p>
        <ul className="mt-3 space-y-1.5">
          {participants.map((p) => (
            <li key={p.userId} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {currentOwnerId === p.userId && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                <span>{p.fullName}</span>
                <span className="text-xs text-[var(--color-muted)]">{p.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={p.role}
                  onChange={(e) => setRole(p.userId, e.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 text-[11px]"
                >
                  <option value="OWNER">Owner</option>
                  <option value="COLLABORATOR">Collaborator</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <button onClick={() => remove(p.userId)} className="text-[var(--color-muted)] hover:text-rose-500" aria-label="Remove">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {participants.length === 0 && <li className="text-sm text-[var(--color-muted)]">No participants yet.</li>}
        </ul>
        {available.length > 0 && (
          <div className="mt-3 flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-[var(--color-muted)]" />
            <select defaultValue="" onChange={(e) => { add(e.target.value); e.target.value = ''; }} className="input-base text-sm">
              <option value="">Add a participant…</option>
              {available.map((u) => <option key={u.id} value={u.id}>{u.fullName} · {u.email}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold">Delivery</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-base">Delivery team</label>
            <select
              defaultValue={currentTeamId ?? ''}
              onChange={(e) => patchProject({ teamId: e.target.value || null })}
              className="input-base text-sm"
            >
              <option value="">No team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-base">Project lead</label>
            <select
              defaultValue={currentOwnerId ?? ''}
              onChange={(e) => patchProject({ ownerId: e.target.value || null })}
              className="input-base text-sm"
            >
              <option value="">No lead</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
