import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  await prisma.apiKey.updateMany({
    where: { id, tenantId: auth.tenant.id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
