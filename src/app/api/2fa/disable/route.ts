import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST() {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { totpEnabled: false, totpSecret: null, recoveryCodes: undefined },
  });
  return NextResponse.json({ ok: true });
}
