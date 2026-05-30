/**
 * Teams — list + create. Gated on team.manage (Owner/Admin/Manager).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('team.view');
  if ('error' in auth) return auth.error;
  const teams = await prisma.team.findMany({
    where: { tenantId: auth.tenant.id, archived: false },
    include: {
      lead: { select: { id: true, fullName: true } },
      _count: { select: { memberships: true, projects: true } },
      memberships: {
        include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ teams });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
  color: z.string().max(9).optional(),
  leadUserId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('team.manage');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const exists = await prisma.team.findFirst({
    where: { tenantId: auth.tenant.id, name: parsed.data.name },
  });
  if (exists) return NextResponse.json({ error: 'A team with that name already exists' }, { status: 409 });

  const team = await prisma.team.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color ?? '#6366f1',
      leadUserId: parsed.data.leadUserId,
      // The lead is automatically a LEAD member.
      memberships: parsed.data.leadUserId
        ? { create: [{ userId: parsed.data.leadUserId, teamRole: 'LEAD' }] }
        : undefined,
    },
    include: { memberships: true },
  });
  return NextResponse.json({ team }, { status: 201 });
}
