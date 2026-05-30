/**
 * Single project (workspace) ops.
 *
 * GET   — full workspace payload
 * PATCH — update stage / status / name / dates / cover / tags / leadSource / notes.
 *         On stage change, logs an Activity (STAGE_CHANGE) so the feed reflects it.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { parsePermissions, visibleProjectScope, projectInScope } from '@/lib/session';

const PROJECT_STAGES = ['KICKOFF', 'ONBOARDING', 'PLANNING', 'DELIVERY', 'COMPLETED', 'ARCHIVED'] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const scope = await visibleProjectScope({
    userId: auth.user.id,
    tenantId: auth.tenant.id,
    permissions: parsePermissions(auth.role.permissions as unknown),
  });
  if (!projectInScope(scope, id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const project = await prisma.project.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: {
      contact: true,
      lead: { include: { stage: true } },
      tasks: { orderBy: [{ sortOrder: 'asc' }] },
      invoices: { include: { payments: true } },
      proposals: true,
      paymentSchedules: { include: { items: { orderBy: { dueDate: 'asc' } } } },
    },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ project });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  status: z.enum(['PLANNING', 'CONFIRMED', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  leadSource: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  notesText: z.string().max(20000).nullable().optional(),
  teamId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;

  const existing = await prisma.project.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.description !== undefined) data.description = d.description;
  if (d.stage !== undefined) data.stage = d.stage;
  if (d.status !== undefined) data.status = d.status;
  if (d.startDate !== undefined) data.startDate = d.startDate ? new Date(d.startDate) : null;
  if (d.endDate !== undefined) data.endDate = d.endDate ? new Date(d.endDate) : null;
  if (d.coverImageUrl !== undefined) data.coverImageUrl = d.coverImageUrl;
  if (d.leadSource !== undefined) data.leadSource = d.leadSource;
  if (d.tags !== undefined) data.tags = d.tags as object;
  if (d.notesText !== undefined) data.notesText = d.notesText;
  if (d.teamId !== undefined) data.teamId = d.teamId;
  if (d.ownerId !== undefined) data.ownerId = d.ownerId;

  // Stage transition → feed entry + auto-bump status when entering terminal stages.
  if (d.stage && d.stage !== existing.stage) {
    if (d.stage === 'COMPLETED') data.status = 'DONE';
    else if (d.stage === 'ARCHIVED') data.status = data.status ?? existing.status;
    else if (existing.status === 'PLANNING') data.status = 'IN_PROGRESS';
    await prisma.activity.create({
      data: {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        projectId: id,
        type: 'STAGE_CHANGE',
        title: `Stage → ${d.stage.charAt(0) + d.stage.slice(1).toLowerCase()}`,
        meta: { from: existing.stage, to: d.stage } as object,
      },
    });
  }

  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json({ project });
}
