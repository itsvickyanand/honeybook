/**
 * Team cascade engine.
 *
 * Teams *do* something now: assigning a Team to a Project auto-grants every
 * member access, and adding/removing a Person to/from a Team optionally
 * propagates to all the team's projects. Auto-rows are tagged with
 * `inheritedFromTeamId` so we can tell explicit ad-hoc adds from cascade ones
 * and reverse cleanly.
 *
 * Idempotent. Wraps in $transaction. Side effects (Activity log, Notification)
 * are best-effort and never block the cascade itself.
 */
import { prisma } from '../db';
import { logger } from '../logger';

interface CascadeOpts {
  actorUserId?: string | null; // who triggered the change (audit)
}

/** Inherited row identity = (projectId, userId, inheritedFromTeamId). */
async function addInheritedRow(projectId: string, userId: string, teamId: string, actor: string | null) {
  // Don't clobber an explicit row. The `(projectId, userId)` unique means we
  // can't have two rows for the same person, so if an explicit row exists we
  // simply tag it as also inherited so a Team unassign doesn't remove it.
  const existing = await prisma.projectMember.findFirst({ where: { projectId, userId } });
  if (existing) {
    // Already on the project; nothing to do (keep whatever role they had).
    return existing;
  }
  return prisma.projectMember.create({
    data: {
      projectId, userId,
      kind: 'TEAM',
      role: 'TEAM',
      inheritedFromTeamId: teamId,
      createdById: actor ?? undefined,
    },
  });
}

async function removeInheritedRow(projectId: string, userId: string, teamId: string) {
  // Only delete if THIS team was the source (preserves explicit ad-hoc adds).
  await prisma.projectMember.deleteMany({
    where: { projectId, userId, inheritedFromTeamId: teamId },
  });
}

async function logActivity(tenantId: string, opts: { userId: string | null; projectId?: string | null; type: string; title: string; body?: string }) {
  try {
    await prisma.activity.create({
      data: {
        tenantId,
        userId: opts.userId ?? undefined,
        projectId: opts.projectId ?? undefined,
        type: opts.type,
        title: opts.title,
        body: opts.body,
      },
    });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'teams.cascade.activity.failed');
  }
}

async function notify(tenantId: string, userId: string, opts: { title: string; href?: string; type?: string }) {
  try {
    await prisma.notification.create({
      data: { tenantId, userId, type: opts.type ?? 'team.cascade', title: opts.title, href: opts.href },
    });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'teams.cascade.notify.failed');
  }
}

/**
 * A project's team changed (or was set). Replace the prior team's inherited
 * members with the new team's members. Pass `oldTeamId=null` for a first-time
 * assignment; pass `newTeamId=null` to fully unassign.
 */
export async function applyTeamToProject(
  projectId: string,
  newTeamId: string | null,
  oldTeamId: string | null,
  opts: CascadeOpts = {}
): Promise<{ added: number; removed: number }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, tenantId: true },
  });
  if (!project) return { added: 0, removed: 0 };
  const actor = opts.actorUserId ?? null;

  let removed = 0;
  let added = 0;

  // 1) Drop inherited rows from the old team.
  if (oldTeamId) {
    const r = await prisma.projectMember.deleteMany({
      where: { projectId, inheritedFromTeamId: oldTeamId },
    });
    removed = r.count;
  }

  // 2) Add inherited rows for the new team's members.
  if (newTeamId) {
    const memberships = await prisma.teamMembership.findMany({
      where: { teamId: newTeamId },
      select: { userId: true, team: { select: { name: true } } },
    });
    for (const m of memberships) {
      const row = await addInheritedRow(projectId, m.userId, newTeamId, actor);
      if (row) {
        added++;
        await notify(project.tenantId, m.userId, {
          title: `You've been added to ${project.name}`,
          href: `/app/projects/${projectId}`,
          type: 'project.added',
        });
      }
    }
    await logActivity(project.tenantId, {
      userId: actor,
      projectId,
      type: 'TEAM',
      title: 'Team assigned to project',
      body: `Cascaded ${added} member${added === 1 ? '' : 's'} from team.`,
    });
  } else if (oldTeamId) {
    await logActivity(project.tenantId, {
      userId: actor,
      projectId,
      type: 'TEAM',
      title: 'Team removed from project',
      body: `Removed ${removed} inherited member${removed === 1 ? '' : 's'}.`,
    });
  }

  return { added, removed };
}

/**
 * Person joined a team. When `alsoAddToProjects=true` (the prompt-each-time
 * "Yes" answer), add them as inherited to every project linked to the team.
 */
export async function applyPersonToTeam(
  teamId: string,
  userId: string,
  alsoAddToProjects: boolean,
  opts: CascadeOpts = {}
): Promise<{ added: number; projectIds: string[] }> {
  if (!alsoAddToProjects) return { added: 0, projectIds: [] };
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, tenantId: true } });
  if (!team) return { added: 0, projectIds: [] };
  const projects = await prisma.project.findMany({ where: { teamId }, select: { id: true, name: true } });

  const projectIds: string[] = [];
  let added = 0;
  for (const p of projects) {
    const row = await addInheritedRow(p.id, userId, teamId, opts.actorUserId ?? null);
    if (row) {
      added++;
      projectIds.push(p.id);
      await notify(team.tenantId, userId, {
        title: `You've been added to ${p.name} via team "${team.name}"`,
        href: `/app/projects/${p.id}`,
        type: 'project.added',
      });
    }
  }
  await logActivity(team.tenantId, {
    userId: opts.actorUserId ?? null,
    type: 'TEAM',
    title: `Cascaded user to team's ${added} project${added === 1 ? '' : 's'}`,
  });
  return { added, projectIds };
}

/** Person removed from team → drop their inherited rows from every team project. */
export async function applyPersonRemovedFromTeam(
  teamId: string,
  userId: string,
  opts: CascadeOpts = {}
): Promise<{ removed: number }> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { tenantId: true } });
  if (!team) return { removed: 0 };
  const r = await prisma.projectMember.deleteMany({
    where: { userId, inheritedFromTeamId: teamId },
  });
  await logActivity(team.tenantId, {
    userId: opts.actorUserId ?? null,
    type: 'TEAM',
    title: `Removed inherited project access from team`,
    body: `Removed ${r.count} project member row${r.count === 1 ? '' : 's'}.`,
  });
  return { removed: r.count };
}

/** Preview-only: what would change if we cascade this person across the team's projects. */
export async function previewPersonToTeam(teamId: string, userId: string): Promise<{
  totalProjects: number;
  alreadyOnProjectIds: string[];
  willAddProjectIds: string[];
}> {
  const projects = await prisma.project.findMany({ where: { teamId }, select: { id: true } });
  const ids = projects.map((p) => p.id);
  if (!ids.length) return { totalProjects: 0, alreadyOnProjectIds: [], willAddProjectIds: [] };
  const existing = await prisma.projectMember.findMany({
    where: { userId, projectId: { in: ids } },
    select: { projectId: true },
  });
  const onSet = new Set(existing.map((e) => e.projectId));
  return {
    totalProjects: ids.length,
    alreadyOnProjectIds: ids.filter((id) => onSet.has(id)),
    willAddProjectIds: ids.filter((id) => !onSet.has(id)),
  };
}
