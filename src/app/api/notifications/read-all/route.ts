import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST() {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  await prisma.notification.updateMany({
    where: { tenantId: auth.tenant.id, OR: [{ userId: null }, { userId: auth.user.id }], readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
