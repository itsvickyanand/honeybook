/**
 * Google Calendar push.
 * Returns the Google event id on success, null when not connected, throws on API error.
 */
import { prisma } from '../db';

export async function pushEventToGoogle(
  tenantId: string,
  event: { title: string; description?: string | null; startAt: Date; endAt: Date; location?: string | null; allDay?: boolean }
): Promise<string | null> {
  const conn = await prisma.accountingConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'google_calendar' } },
  });
  if (!conn || conn.status !== 'CONNECTED') return null;

  const accessToken = await ensureGoogleAccessToken(conn);

  const body = event.allDay
    ? {
        summary: event.title,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        start: { date: event.startAt.toISOString().slice(0, 10) },
        end: { date: event.endAt.toISOString().slice(0, 10) },
      }
    : {
        summary: event.title,
        description: event.description ?? undefined,
        location: event.location ?? undefined,
        start: { dateTime: event.startAt.toISOString() },
        end: { dateTime: event.endAt.toISOString() },
      };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function ensureGoogleAccessToken(conn: { id: string; accessToken: string | null; refreshToken: string | null; expiresAt: Date | null }): Promise<string> {
  if (conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken) throw new Error('Google refresh token missing');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: conn.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google refresh ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  await prisma.accountingConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) },
  });
  return data.access_token;
}
