/**
 * Collaborator portal: mark one of THEIR tasks done/undone. Scoped strictly to
 * tasks assigned to the collaborator behind this magic-link token.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({ taskId: z.string(), status: z.enum(['TODO', 'DONE']) });

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await prisma.projectMember.findFirst({ where: { accessToken: token, kind: 'COLLABORATOR' }, select: { id: true } });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const result = await prisma.task.updateMany({
    where: { id: parsed.data.taskId, assigneeMemberId: member.id },
    data: { status: parsed.data.status, completedAt: parsed.data.status === 'DONE' ? new Date() : null },
  });
  if (result.count === 0) return NextResponse.json({ error: 'Task not yours' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
