/**
 * Team membership — add, change role, remove, and MOVE between teams.
 *
 * POST   { userId, teamRole? }              add a member
 * POST   { userId, fromTeamId }             move a member from another team → this one
 * PATCH  { userId, teamRole }               change a member's role in this team
 * DELETE ?userId=                           remove a member
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { applyPersonToTeam, applyPersonRemovedFromTeam, previewPersonToTeam } from '@/lib/teams/cascade';

async function ensureTeam(tenantId: string, id: string) {
  return prisma.team.findFirst({ where: { id, tenantId } });
}
async function ensureUser(tenantId: string, userId: string) {
  return prisma.user.findFirst({ where: { id: userId, tenantId } });
}

const postSchema = z.object({
  userId: z.string(),
  teamRole: z.enum(['LEAD', 'MEMBER']).default('MEMBER'),
  fromTeamId: z.string().optional(),
  /** Cascade: add them to all this team's current projects. */
  alsoAddToProjects: z.boolean().optional().default(true),
  /** Just preview the cascade (returns counts; no membership change). */
  preview: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  if (!(await ensureTeam(auth.tenant.id, id))) return NextResponse.json({ error: 'Team not found' }, { status: 404 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  if (!(await ensureUser(auth.tenant.id, parsed.data.userId)))
    return NextResponse.json({ error: 'User not in this business' }, { status: 400 });

  // Preview-only: show what the cascade would do without writing membership.
  if (parsed.data.preview) {
    const preview = await previewPersonToTeam(id, parsed.data.userId);
    return NextResponse.json({ preview });
  }

  // Move = remove from the source team in the same transaction (and reverse-cascade).
  await prisma.$transaction(async (tx) => {
    if (parsed.data.fromTeamId && parsed.data.fromTeamId !== id) {
      await tx.teamMembership.deleteMany({
        where: { teamId: parsed.data.fromTeamId, userId: parsed.data.userId },
      });
    }
    await tx.teamMembership.upsert({
      where: { teamId_userId: { teamId: id, userId: parsed.data.userId } },
      update: { teamRole: parsed.data.teamRole },
      create: { teamId: id, userId: parsed.data.userId, teamRole: parsed.data.teamRole },
    });
  });
  // If moved from another team, drop their inherited rows from THAT team's projects.
  if (parsed.data.fromTeamId && parsed.data.fromTeamId !== id) {
    await applyPersonRemovedFromTeam(parsed.data.fromTeamId, parsed.data.userId, { actorUserId: auth.user.id }).catch(() => null);
  }
  // Cascade them onto this team's projects (the prompt-each-time decision).
  const cascade = await applyPersonToTeam(id, parsed.data.userId, parsed.data.alsoAddToProjects, { actorUserId: auth.user.id })
    .catch(() => ({ added: 0, projectIds: [] }));
  return NextResponse.json({ ok: true, cascade });
}

const patchSchema = z.object({ userId: z.string(), teamRole: z.enum(['LEAD', 'MEMBER']) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  if (!(await ensureTeam(auth.tenant.id, id))) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  await prisma.teamMembership.update({
    where: { teamId_userId: { teamId: id, userId: parsed.data.userId } },
    data: { teamRole: parsed.data.teamRole },
  }).catch(() => null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (!(await ensureTeam(auth.tenant.id, id))) return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  await prisma.teamMembership.deleteMany({ where: { teamId: id, userId } });
  // If they were the lead, clear it.
  await prisma.team.updateMany({ where: { id, leadUserId: userId }, data: { leadUserId: null } });
  // Reverse cascade: drop their inherited rows from this team's projects.
  const cascade = await applyPersonRemovedFromTeam(id, userId, { actorUserId: auth.user.id })
    .catch(() => ({ removed: 0 }));
  return NextResponse.json({ ok: true, cascade });
}
