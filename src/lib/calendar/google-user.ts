/**
 * Per-user Google Calendar adapter (Integration scope='user').
 * Token storage in Integration.credentials JSON: { accessToken, refreshToken }.
 * No-ops when GOOGLE_CLIENT_ID/SECRET aren't configured (mock mode).
 */
import { prisma } from '../db';
import { logger } from '../logger';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function loadIntegration(userId: string) {
  return prisma.integration.findFirst({
    where: { scope: 'user', userId, provider: 'google_calendar', status: 'CONNECTED' },
  });
}

async function refreshIfNeeded(intg: NonNullable<Awaited<ReturnType<typeof loadIntegration>>>): Promise<string | null> {
  const creds = (intg.credentials ?? {}) as { accessToken?: string; refreshToken?: string };
  const expiresAt = intg.expiresAt ?? null;
  if (creds.accessToken && expiresAt && expiresAt.getTime() > Date.now() + 30_000) {
    return creds.accessToken;
  }
  if (!creds.refreshToken || !googleConfigured()) return creds.accessToken ?? null;
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = (await res.json()) as { access_token: string; expires_in: number };
    await prisma.integration.update({
      where: { id: intg.id },
      data: {
        credentials: { accessToken: data.access_token, refreshToken: creds.refreshToken },
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    });
    return data.access_token;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'google-user.refresh.failed');
    return null;
  }
}

export async function getAccessToken(userId: string): Promise<string | null> {
  const intg = await loadIntegration(userId);
  if (!intg) return null;
  return refreshIfNeeded(intg);
}

export interface PushEventArgs {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: { email: string; name?: string }[];
  /** Ask Google to auto-generate a Meet link. Sets conferenceData.createRequest. */
  addMeetLink?: boolean;
}

export interface PushEventResult {
  externalId: string;
  hangoutLink: string | null;
}

/** Create or update an event on the user's primary calendar. */
export async function pushUserEvent(userId: string, externalId: string | null, e: PushEventArgs): Promise<PushEventResult | null> {
  const token = await getAccessToken(userId);
  if (!token) return null;
  const body: Record<string, unknown> = {
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: { dateTime: e.start.toISOString() },
    end: { dateTime: e.end.toISOString() },
    attendees: e.attendees?.map((a) => ({ email: a.email, displayName: a.name })),
  };
  if (e.addMeetLink) {
    body.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }
  try {
    const params = new URLSearchParams();
    if (e.addMeetLink) params.set('conferenceDataVersion', '1');
    if (e.attendees && e.attendees.length) params.set('sendUpdates', 'all');
    const qs = params.toString();
    const url = externalId
      ? `${CAL_BASE}/calendars/primary/events/${externalId}${qs ? '?' + qs : ''}`
      : `${CAL_BASE}/calendars/primary/events${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      method: externalId ? 'PATCH' : 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) { logger.warn({ status: res.status, err: await res.text() }, 'google-user.push.failed'); return null; }
    const data = (await res.json()) as { id: string; hangoutLink?: string };
    return { externalId: data.id, hangoutLink: data.hangoutLink ?? null };
  } catch (e) { logger.warn({ err: (e as Error).message }, 'google-user.push.error'); return null; }
}

export interface BusySlot { start: Date; end: Date }

export async function listUserBusy(userId: string, from: Date, to: Date): Promise<BusySlot[]> {
  const token = await getAccessToken(userId);
  if (!token) return [];
  try {
    const res = await fetch(`${CAL_BASE}/freeBusy`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { calendars?: { primary?: { busy?: { start: string; end: string }[] } } };
    return (data.calendars?.primary?.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  } catch { return []; }
}
