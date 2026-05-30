import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const where = {
    tenantId: auth.tenant.id,
    OR: [{ userId: null }, { userId: auth.user.id }],
    ...(unreadOnly ? { readAt: null } : {}),
  };
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { tenantId: auth.tenant.id, OR: [{ userId: null }, { userId: auth.user.id }], readAt: null } }),
  ]);
  return NextResponse.json({ notifications: items, unread });
}
