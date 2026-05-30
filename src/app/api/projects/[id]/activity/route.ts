/**
 * Project activity feed.
 *
 * GET  — merged timeline (Activity rows for this project + its contact/lead).
 * POST — add a NOTE, or send an EMAIL to the client (queued via the worker /
 *        inline). Both are recorded as Activity so the feed is the system of
 *        record for everything that happened on the workspace.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true, contactId: true, leadId: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const activities = await prisma.activity.findMany({
    where: {
      tenantId: auth.tenant.id,
      OR: [
        { projectId: id },
        project.contactId ? { contactId: project.contactId } : undefined,
        project.leadId ? { leadId: project.leadId } : undefined,
      ].filter(Boolean) as object[],
    },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ activities });
}

const postSchema = z.object({
  kind: z.enum(['NOTE', 'EMAIL']),
  body: z.string().min(1).max(5000),
  subject: z.string().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { contact: true },
  });
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.kind === 'EMAIL') {
    const to = project.contact?.email;
    if (!to) return NextResponse.json({ error: 'Client has no email on file' }, { status: 400 });
    await enqueue(JOB_NAMES.EMAIL_SEND, {
      to,
      subject: parsed.data.subject ?? `Update on ${project.name}`,
      html: `<p>${parsed.data.body.replace(/\n/g, '<br/>')}</p>`,
      text: parsed.data.body,
    }).catch(() => {});
  }

  const activity = await prisma.activity.create({
    data: {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      projectId: id,
      contactId: project.contactId,
      type: parsed.data.kind,
      title:
        parsed.data.kind === 'EMAIL'
          ? `Email sent: ${parsed.data.subject ?? 'Update'}`
          : 'Note added',
      body: parsed.data.body,
    },
    include: { user: { select: { fullName: true } } },
  });

  return NextResponse.json({ activity }, { status: 201 });
}
