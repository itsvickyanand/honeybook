/**
 * Tasks API — list + create.
 *
 * GET  /api/tasks?projectId=&assigneeId=&status=&dueBefore=
 * POST /api/tasks  { title, projectId?, contactId?, leadId?, assigneeId?, dueDate?, ... }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { parsePermissions, visibleProjectScope } from '@/lib/session';

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;

  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const assigneeId = url.searchParams.get('assigneeId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const dueBefore = url.searchParams.get('dueBefore');

  // Access scoping: limit to tasks on visible projects + own + standalone.
  const scope = await visibleProjectScope({
    userId: auth.user.id,
    tenantId: auth.tenant.id,
    permissions: parsePermissions(auth.role.permissions as unknown),
  });
  const scopeFilter =
    scope === 'all'
      ? {}
      : { OR: [{ projectId: { in: scope } }, { projectId: null }, { assigneeId: auth.user.id }] };

  const tasks = await prisma.task.findMany({
    where: {
      tenantId: auth.tenant.id,
      projectId: projectId ?? undefined,
      assigneeId: assigneeId ?? undefined,
      status: status ?? undefined,
      dueDate: dueBefore ? { lte: new Date(dueBefore) } : undefined,
      ...scopeFilter,
    },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { sortOrder: 'asc' }],
    include: {
      project: { select: { id: true, name: true } },
    },
    take: 500,
  });
  return NextResponse.json({ tasks });
}

const createSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(2000).optional(),
  projectId: z.string().optional(),
  contactId: z.string().optional(),
  leadId: z.string().optional(),
  assigneeId: z.string().optional(),
  category: z.enum(['PREP', 'COMMUNICATION', 'DELIVERY', 'ADMIN', 'FOLLOWUP']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.string().datetime().optional(),
  reminderHoursBefore: z.number().int().min(0).max(720).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 });

  const task = await prisma.task.create({
    data: {
      tenantId: auth.tenant.id,
      title: parsed.data.title,
      description: parsed.data.description,
      projectId: parsed.data.projectId,
      contactId: parsed.data.contactId,
      leadId: parsed.data.leadId,
      assigneeId: parsed.data.assigneeId,
      category: parsed.data.category ?? 'PREP',
      priority: parsed.data.priority ?? 'MEDIUM',
      status: 'TODO',
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      reminderHoursBefore: parsed.data.reminderHoursBefore,
    },
  });
  return NextResponse.json({ task }, { status: 201 });
}
