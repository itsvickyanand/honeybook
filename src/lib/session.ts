/**
 * Server-side session helper that returns the full session + user + tenant
 * + role records. Use in server components and route handlers.
 */
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { getSession } from './auth';

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function getCurrentContext() {
  const s = await getSession();
  if (!s) return null;
  const user = await prisma.user.findUnique({
    where: { id: s.userId },
    include: {
      role: true,
      tenant: { include: { businessType: true } },
    },
  });
  if (!user) return null;
  return {
    session: s,
    user,
    tenant: user.tenant,
    role: user.role,
    permissions: parsePermissions(user.role.permissions as unknown),
  };
}

export async function requireContext() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export function parsePermissions(input: unknown): string[] {
  if (Array.isArray(input)) return input as string[];
  if (typeof input === 'string') {
    try {
      const arr = JSON.parse(input);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function hasPermission(permissions: string[], required: string) {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  // wildcard matching, e.g. catalog.* matches catalog.edit
  for (const p of permissions) {
    if (p.endsWith('.*') && required.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

/**
 * RBAC Phase 3 — project access scoping.
 *
 * Returns 'all' when the user may see every project in the tenant
 * (project.view.all, held by Owner/Admin/Manager), otherwise the set of
 * project IDs they can access: projects they're a participant on, projects
 * owned by them, or projects assigned to a team they belong to.
 */
export type ProjectScope = 'all' | string[];

export async function visibleProjectScope(opts: {
  userId: string;
  tenantId: string;
  permissions: string[];
}): Promise<ProjectScope> {
  if (hasPermission(opts.permissions, 'project.view.all')) return 'all';

  const [participantRows, teamRows] = await Promise.all([
    prisma.projectMember.findMany({
      where: { userId: opts.userId, project: { tenantId: opts.tenantId } },
      select: { projectId: true },
    }),
    prisma.teamMembership.findMany({
      where: { userId: opts.userId },
      select: { teamId: true },
    }),
  ]);
  const teamIds = teamRows.map((t) => t.teamId);
  const [teamProjects, owned] = await Promise.all([
    teamIds.length
      ? prisma.project.findMany({
          where: { tenantId: opts.tenantId, teamId: { in: teamIds } },
          select: { id: true },
        })
      : Promise.resolve([] as { id: string }[]),
    prisma.project.findMany({
      where: { tenantId: opts.tenantId, ownerId: opts.userId },
      select: { id: true },
    }),
  ]);

  return Array.from(
    new Set([
      ...participantRows.map((p) => p.projectId),
      ...teamProjects.map((p) => p.id),
      ...owned.map((p) => p.id),
    ])
  );
}

/** Prisma `where` fragment for the current project scope. */
export function projectScopeWhere(scope: ProjectScope, tenantId: string) {
  if (scope === 'all') return { tenantId };
  return { tenantId, id: { in: scope } };
}

/** True if a given project id is visible under the scope. */
export function projectInScope(scope: ProjectScope, projectId: string) {
  return scope === 'all' || scope.includes(projectId);
}
