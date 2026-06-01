/**
 * Per-user Google OAuth callback → exchange code, store Integration row
 * (scope=user, userId, provider=google_calendar) with refresh token + expiry.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireApi } from '@/lib/api';

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.APP_URL ?? 'http://localhost:3000'}/api/integrations/google/callback`,
    }),
  });
  if (!res.ok) return NextResponse.json({ error: 'Token exchange failed', detail: await res.text() }, { status: 502 });
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };

  const existing = await prisma.integration.findFirst({
    where: { scope: 'user', userId: auth.user.id, provider: 'google_calendar' },
  });
  const payload = {
    scope: 'user',
    tenantId: auth.tenant.id,
    userId: auth.user.id,
    provider: 'google_calendar',
    status: 'CONNECTED',
    credentials: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? (existing?.credentials as { refreshToken?: string } | null)?.refreshToken,
    } as object,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    accountEmail: auth.user.email,
  };
  if (existing) await prisma.integration.update({ where: { id: existing.id }, data: payload });
  else await prisma.integration.create({ data: payload });

  return NextResponse.redirect(`${process.env.APP_URL ?? 'http://localhost:3000'}/app/calendar?google=connected`);
}
