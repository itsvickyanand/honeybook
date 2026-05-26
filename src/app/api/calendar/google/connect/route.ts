import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google not configured' }, { status: 400 });
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('redirect_uri', `${process.env.APP_URL ?? 'http://localhost:3000'}/api/calendar/google/callback`);
  url.searchParams.set('state', auth.tenant.id);
  return NextResponse.redirect(url.toString());
}
