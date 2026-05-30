/**
 * Project participants (the workspace "Visible to you + N" panel).
 *
 * Three kinds (matching HoneyBook's Add menu):
 *   - Contact      → a client you serve (existing contactId, or name+email to create)
 *   - Collaborator → external helper; we mint a magic-link token for a scoped portal
 *   - Team member  → an internal user with account access
 *
 * GET    list participants (resolved display rows)
 * POST   add a participant by kind
 * DELETE ?memberId=  remove
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/comms';
import { toParticipantView, newCollaboratorToken } from '@/lib/participants';

async function ensureProject(tenantId: string, id: string) {
  return prisma.project.findFirst({ where: { id, tenantId }, select: { id: true, name: true } });
}

const include = {
  user: { select: { fullName: true, email: true } },
  contact: { select: { fullName: true, email: true } },
} as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  if (!(await ensureProject(auth.tenant.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const members = await prisma.projectMember.findMany({ where: { projectId: id }, include, orderBy: { createdAt: 'asc' } });
  return NextResponse.json({ participants: members.map(toParticipantView) });
}

const postSchema = z.object({
  kind: z.enum(['TEAM', 'COLLABORATOR', 'CONTACT']),
  role: z.string().optional(),
  // TEAM
  userId: z.string().optional(),
  // CONTACT (existing) or create
  contactId: z.string().optional(),
  // CONTACT create / COLLABORATOR
  name: z.string().optional(),
  email: z.string().email().optional(),
  notify: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('project.assign');
  if ('error' in auth) return auth.error;
  const project = await ensureProject(auth.tenant.id, id);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const d = parsed.data;

  if (d.kind === 'TEAM') {
    if (!d.userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    const user = await prisma.user.findFirst({ where: { id: d.userId, tenantId: auth.tenant.id }, select: { id: true } });
    if (!user) return NextResponse.json({ error: 'User not in this business' }, { status: 400 });
    const m = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: d.userId } },
      update: { kind: 'TEAM', role: d.role ?? 'TEAM' },
      create: { projectId: id, kind: 'TEAM', userId: d.userId, role: d.role ?? 'TEAM' },
      include,
    });
    return NextResponse.json({ participant: toParticipantView(m) }, { status: 201 });
  }

  if (d.kind === 'CONTACT') {
    let contactId = d.contactId;
    if (!contactId) {
      if (!d.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
      const c = await prisma.contact.create({
        data: { tenantId: auth.tenant.id, fullName: d.name, email: d.email ?? null, source: 'project' },
      });
      contactId = c.id;
    } else {
      const c = await prisma.contact.findFirst({ where: { id: contactId, tenantId: auth.tenant.id }, select: { id: true } });
      if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 400 });
    }
    const existing = await prisma.projectMember.findFirst({ where: { projectId: id, contactId } });
    const m = existing
      ? await prisma.projectMember.update({ where: { id: existing.id }, data: { kind: 'CONTACT', role: 'CLIENT' }, include })
      : await prisma.projectMember.create({ data: { projectId: id, kind: 'CONTACT', contactId, role: 'CLIENT' }, include });
    return NextResponse.json({ participant: toParticipantView(m) }, { status: 201 });
  }

  // COLLABORATOR
  if (!d.name && !d.email) return NextResponse.json({ error: 'name or email required' }, { status: 400 });
  const token = newCollaboratorToken();
  const m = await prisma.projectMember.create({
    data: { projectId: id, kind: 'COLLABORATOR', name: d.name ?? d.email ?? 'Collaborator', email: d.email ?? null, role: d.role ?? 'COLLABORATOR', accessToken: token },
    include,
  });
  const portalUrl = `${process.env.APP_URL ?? 'http://localhost:3000'}/c/${token}`;
  if (d.notify && d.email) {
    await sendEmail({
      to: d.email,
      subject: `You've been added to ${project.name}`,
      html: `<p>Hi ${d.name ?? 'there'},</p><p>You've been added as a collaborator on <strong>${project.name}</strong>. Open your workspace to see your tasks and shared files:</p>
<p style="margin:24px 0"><a href="${portalUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open workspace</a></p>
<p style="color:#666;font-size:12px">${portalUrl}</p>`,
    }).catch(() => {});
  }
  return NextResponse.json({ participant: toParticipantView(m), portalUrl }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('project.assign');
  if ('error' in auth) return auth.error;
  if (!(await ensureProject(auth.tenant.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const url = new URL(req.url);
  const memberId = url.searchParams.get('memberId');
  const userId = url.searchParams.get('userId'); // back-compat
  if (memberId) await prisma.projectMember.deleteMany({ where: { id: memberId, projectId: id } });
  else if (userId) await prisma.projectMember.deleteMany({ where: { projectId: id, userId } });
  else return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
