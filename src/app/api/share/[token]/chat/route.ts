/**
 * In-portal chat (client side).
 *
 * GET — list messages on the thread for this proposal
 * POST — client sends a message
 *
 * For real-time, swap to Server-Sent Events or socket.io on a custom server.
 * The data model is the same — only the transport changes.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

async function findOrCreateThread(proposalId: string, tenantId: string, contactId: string | null) {
  let thread = await prisma.chatThread.findFirst({
    where: { proposalId, channel: 'PORTAL' },
  });
  if (!thread) {
    thread = await prisma.chatThread.create({
      data: { proposalId, tenantId, contactId: contactId ?? undefined, channel: 'PORTAL' },
    });
  }
  return thread;
}

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const thread = await findOrCreateThread(p.id, p.tenantId, p.contactId);
  const messages = await prisma.message.findMany({
    where: { threadId: thread.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

const schema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const thread = await findOrCreateThread(p.id, p.tenantId, p.contactId);
  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      tenantId: p.tenantId,
      direction: 'INBOUND', // from client's perspective the client is INBOUND to the vendor
      body: parsed.data.body,
      status: 'DELIVERED',
    },
  });
  await prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  return NextResponse.json({ message: { id: message.id, body: message.body, direction: message.direction } });
}
