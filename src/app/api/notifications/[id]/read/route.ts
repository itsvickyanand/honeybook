import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  await prisma.notification.updateMany({
    where: { id, tenantId: auth.tenant.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
