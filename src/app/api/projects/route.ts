import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { parsePermissions, visibleProjectScope, projectScopeWhere } from '@/lib/session';

const schema = z.object({
  name: z.string().min(1),
  contactId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  description: z.string().optional(),
});

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const scope = await visibleProjectScope({
    userId: auth.user.id,
    tenantId: auth.tenant.id,
    permissions: parsePermissions(auth.role.permissions as unknown),
  });
  const projects = await prisma.project.findMany({
    where: projectScopeWhere(scope, auth.tenant.id),
    include: { contact: true, members: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const project = await prisma.project.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      contactId: parsed.data.contactId,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      description: parsed.data.description,
    },
  });
  return NextResponse.json({ project });
}
