/**
 * Helpers for project participants (the workspace "Visible to you + N" panel).
 *
 * A participant is polymorphic (ProjectMember.kind):
 *   TEAM         → an internal User (full workspace access via RBAC)
 *   CONTACT      → a client Contact (sees their portal: shared files, their tasks, invoices)
 *   COLLABORATOR → an external person/business with no account; reached via a
 *                  scoped magic-link portal (their assigned tasks + shared files)
 */
import { randomBytes } from 'crypto';

export type ParticipantKind = 'TEAM' | 'COLLABORATOR' | 'CONTACT';

export interface ParticipantView {
  id: string;
  kind: ParticipantKind;
  role: string;
  userId: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  initials: string;
  accessToken: string | null;
  /** Set when this participant was auto-added by the project's Team cascade. */
  inheritedFromTeamId: string | null;
}

export function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function newCollaboratorToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Resolve a ProjectMember (with user/contact joined) into a display row. */
export function toParticipantView(m: {
  id: string;
  kind: string;
  role: string;
  userId: string | null;
  contactId: string | null;
  email: string | null;
  name: string | null;
  accessToken: string | null;
  inheritedFromTeamId?: string | null;
  user?: { fullName: string; email: string } | null;
  contact?: { fullName: string; email: string | null } | null;
}): ParticipantView {
  const name =
    m.kind === 'TEAM' ? m.user?.fullName ?? m.name ?? 'Team member'
    : m.kind === 'CONTACT' ? m.contact?.fullName ?? m.name ?? 'Client'
    : m.name ?? m.email ?? 'Collaborator';
  const email =
    m.kind === 'TEAM' ? m.user?.email ?? null
    : m.kind === 'CONTACT' ? m.contact?.email ?? null
    : m.email ?? null;
  return {
    id: m.id,
    kind: m.kind as ParticipantKind,
    role: m.role,
    userId: m.userId,
    contactId: m.contactId,
    name,
    email,
    initials: initialsOf(name, email),
    accessToken: m.kind === 'COLLABORATOR' ? m.accessToken : null,
    inheritedFromTeamId: m.inheritedFromTeamId ?? null,
  };
}
