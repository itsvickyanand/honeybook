import { NextResponse } from 'next/server';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST() {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const secret = speakeasy.generateSecret({
    name: `${auth.tenant.name} (${auth.user.email})`,
    issuer: 'Avantus',
  });
  await prisma.user.update({
    where: { id: auth.user.id },
    data: { totpSecret: secret.base32, totpEnabled: false },
  });
  const qr = await QRCode.toDataURL(secret.otpauth_url!);
  return NextResponse.json({ secret: secret.base32, qr });
}
