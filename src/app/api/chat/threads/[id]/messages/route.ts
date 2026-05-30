/**
 * Vendor-side chat: list + send messages on a thread.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const thread = await prisma.chatThread.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { messages: { orderBy: { createdAt: 'asc' }, take: 200 } },
  });
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ thread });
}

const schema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const thread = await prisma.chatThread.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      direction: 'OUTBOUND',
      body: parsed.data.body,
      status: 'SENT',
    },
  });
  await prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  return NextResponse.json({ message });
}
