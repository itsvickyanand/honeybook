import { NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(80).optional(),
  roleId: z.string(),
  teamIds: z.array(z.string()).max(20).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const role = await prisma.role.findFirst({
    where: { id: parsed.data.roleId, tenantId: auth.tenant.id },
  });
  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 400 });

  const existing = await prisma.user.findFirst({
    where: { tenantId: auth.tenant.id, email: parsed.data.email.toLowerCase() },
  });
  if (existing) return NextResponse.json({ error: 'User already on this tenant' }, { status: 409 });

  const token = nanoid(32);
  const invite = await prisma.userInvite.create({
    data: {
      tenantId: auth.tenant.id,
      email: parsed.data.email.toLowerCase(),
      fullName: parsed.data.fullName ?? null,
      roleId: role.id,
      invitedById: auth.user.id,
      token,
      teamIds: parsed.data.teamIds && parsed.data.teamIds.length > 0 ? (parsed.data.teamIds as object) : undefined,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/invite/${token}`;
  await enqueue(JOB_NAMES.EMAIL_SEND, {
    to: invite.email,
    subject: `You've been invited to ${auth.tenant.name}`,
    html: `<p>You've been invited to join <strong>${auth.tenant.name}</strong> as <strong>${role.name}</strong>.</p>
           <p><a href="${url}">Accept your invitation</a></p>`,
  });

  return NextResponse.json({ invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt }, inviteUrl: url });
}
