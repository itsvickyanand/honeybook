/**
 * Google OAuth callback.
 *
 * Exchanges the code for tokens, reads the profile, then:
 *   - existing user (by googleSub or email) → link + log in → /app
 *   - no user → bounce to /signup with email prefilled (they still pick a
 *     business type etc. — we can't provision a tenant from an email alone).
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { issueSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.APP_URL ?? url.origin;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  const jar = await cookies();
  const expected = jar.get('g_oauth_state')?.value;
  jar.delete('g_oauth_state');

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state`);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_unconfigured`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/oauth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) throw new Error('token exchange failed');
    const tokens = (await tokenRes.json()) as { access_token: string };

    const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profRes.ok) throw new Error('userinfo failed');
    const prof = (await profRes.json()) as { sub: string; email: string; name?: string };

    // Match by googleSub first, then email.
    let user = await prisma.user.findUnique({
      where: { googleSub: prof.sub },
      include: { tenant: { select: { slug: true } } },
    });
    if (!user && prof.email) {
      const byEmail = await prisma.user.findFirst({
        where: { email: prof.email.toLowerCase() },
        include: { tenant: { select: { slug: true } } },
      });
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleSub: prof.sub },
          include: { tenant: { select: { slug: true } } },
        });
      }
    }

    if (!user) {
      // No account — send to signup with email prefilled.
      const q = new URLSearchParams({ email: prof.email ?? '', google: '1', sub: prof.sub });
      return NextResponse.redirect(`${appUrl}/signup?${q}`);
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await issueSession({ userId: user.id, tenantId: user.tenantId, roleId: user.roleId, email: user.email });
    return NextResponse.redirect(`${appUrl}/app/setup`);
  } catch {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
  }
}
