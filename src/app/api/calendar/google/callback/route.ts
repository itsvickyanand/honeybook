import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tenantId = url.searchParams.get('state');
  if (!code || !tenantId) return NextResponse.json({ error: 'Missing code/state' }, { status: 400 });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.APP_URL ?? 'http://localhost:3000'}/api/calendar/google/callback`,
    }),
  });
  if (!res.ok) return NextResponse.json({ error: 'Token exchange failed' }, { status: 502 });
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };

  // Reuse AccountingConnection-like pattern; for cleanliness a CalendarConnection model could be added later.
  await prisma.accountingConnection.upsert({
    where: { tenantId_provider: { tenantId, provider: 'google_calendar' } },
    create: {
      tenantId,
      provider: 'google_calendar',
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      status: 'CONNECTED',
    },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      status: 'CONNECTED',
    },
  });
  return NextResponse.redirect(`${process.env.APP_URL ?? 'http://localhost:3000'}/app/settings?integration=google-calendar-connected`);
}
