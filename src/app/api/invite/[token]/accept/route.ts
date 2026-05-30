import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, issueSession } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/api';

const schema = z.object({
  fullName: z.string().min(1).max(80),
  password: z.string().min(8).max(80),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'invite.accept', limit: 10, windowMs: 60_000 });
  if (blocked) return blocked;
  const { token } = await params;
  const invite = await prisma.userInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      tenantId: invite.tenantId,
      roleId: invite.roleId,
      email: invite.email,
      fullName: parsed.data.fullName,
      passwordHash,
      status: 'ACTIVE',
    },
  });
  // Place the new member on the teams chosen at invite time.
  const teamIds = Array.isArray(invite.teamIds) ? (invite.teamIds as string[]) : [];
  if (teamIds.length > 0) {
    const validTeams = await prisma.team.findMany({
      where: { id: { in: teamIds }, tenantId: invite.tenantId },
      select: { id: true },
    });
    if (validTeams.length > 0) {
      await prisma.teamMembership.createMany({
        data: validTeams.map((t) => ({ teamId: t.id, userId: user.id, teamRole: 'MEMBER' })),
        skipDuplicates: true,
      });
    }
  }

  await prisma.userInvite.update({
    where: { id: invite.id },
    data: { acceptedAt: new Date() },
  });
  await issueSession({
    userId: user.id,
    tenantId: user.tenantId,
    roleId: user.roleId,
    email: user.email,
  });
  return NextResponse.json({ ok: true });
}
