/**
 * Single team — update (name/desc/color/lead/archive) + delete.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).nullable().optional(),
  color: z.string().max(9).optional(),
  leadUserId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const team = await prisma.team.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // If a new lead is set, ensure they're a member (as LEAD).
  if (parsed.data.leadUserId) {
    await prisma.teamMembership.upsert({
      where: { teamId_userId: { teamId: id, userId: parsed.data.leadUserId } },
      update: { teamRole: 'LEAD' },
      create: { teamId: id, userId: parsed.data.leadUserId, teamRole: 'LEAD' },
    });
  }

  const updated = await prisma.team.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ team: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const team = await prisma.team.findFirst({ where: { id, tenantId: auth.tenant.id }, select: { id: true } });
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Soft-delete (archive) to preserve project history.
  await prisma.team.update({ where: { id }, data: { archived: true } });
  return NextResponse.json({ ok: true });
}
