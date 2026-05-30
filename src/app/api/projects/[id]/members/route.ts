/**
 * Invite another tenant as a sub-vendor on a project (BRD Addendum Fix 1).
 * Scope is enforced server-side: the member tenant only sees fields listed in scopeJson.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  memberTenantId: z.string(),
  role: z.enum(['COORDINATOR', 'VIEWER']).optional(),
  scope: z.array(z.string()).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const project = await prisma.project.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  if (parsed.data.memberTenantId === auth.tenant.id) {
    return NextResponse.json({ error: 'Cannot invite yourself' }, { status: 400 });
  }

  const member = await prisma.sharedProjectMember.upsert({
    where: { projectId_memberTenantId: { projectId: project.id, memberTenantId: parsed.data.memberTenantId } },
    create: {
      projectId: project.id,
      memberTenantId: parsed.data.memberTenantId,
      role: parsed.data.role ?? 'VIEWER',
      scopeJson: (parsed.data.scope ?? ['timeline', 'status']) as object,
    },
    update: {
      role: parsed.data.role ?? 'VIEWER',
      scopeJson: (parsed.data.scope ?? ['timeline', 'status']) as object,
    },
  });
  return NextResponse.json({ member });
}
