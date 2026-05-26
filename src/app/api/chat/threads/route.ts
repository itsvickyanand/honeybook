import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const threads = await prisma.chatThread.findMany({
    where: { tenantId: auth.tenant.id },
    include: {
      contact: true,
      proposal: { select: { id: true, title: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    take: 100,
  });
  return NextResponse.json({ threads });
}
