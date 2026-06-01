/**
 * Start the per-user Google Calendar OAuth flow.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Google not configured — set GOOGLE_CLIENT_ID/SECRET' }, { status: 400 });
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('redirect_uri', `${process.env.APP_URL ?? 'http://localhost:3000'}/api/integrations/google/callback`);
  // State is just opaque; we rely on the user's session at callback time to know who they are.
  url.searchParams.set('state', `${auth.user.id}.${auth.tenant.id}`);
  return NextResponse.redirect(url.toString());
}
