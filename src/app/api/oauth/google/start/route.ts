/**
 * Begin Google OAuth (login / SSO). Redirects to Google's consent screen.
 * Activates only when GOOGLE_CLIENT_ID/SECRET are set.
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google login not configured' }, { status: 503 });
  }
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  const redirectUri = `${appUrl}/api/oauth/google/callback`;
  const state = randomBytes(16).toString('hex');

  const jar = await cookies();
  jar.set('g_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
