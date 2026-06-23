/**
 * Generic OAuth callback — `/api/oauth/[provider]/callback`.
 *
 * Exchanges the auth code for tokens and upserts the per-tenant Integration
 * row with encrypted access/refresh tokens + the accountEmail (so the Settings
 * card can show "Connected · vendor@example.com").
 *
 * Currently handles the Google family (gmail, google_calendar). Other OAuth
 * providers redirect with an error.
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { encryptCredentials } from '@/lib/integrations/crypto';
import { getSpec } from '@/lib/integrations/registry';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const appUrl = process.env.APP_URL ?? url.origin;
  const settingsBack = `${appUrl}/app/settings/integrations`;

  const spec = getSpec(provider);
  if (!spec) return NextResponse.redirect(`${settingsBack}?error=unknown-provider`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // ── State + tenant resolution from cookie ─────────────────────────────
  const jar = await cookies();
  const stateCookie = jar.get(`oauth_state_${provider}`)?.value;
  jar.delete(`oauth_state_${provider}`);
  if (!code || !state || !stateCookie) {
    return NextResponse.redirect(`${settingsBack}?error=state-missing`);
  }
  let cookieData: { tenantId: string; nonce: string };
  try {
    cookieData = JSON.parse(stateCookie);
  } catch {
    return NextResponse.redirect(`${settingsBack}?error=state-corrupt`);
  }
  if (cookieData.nonce !== state) {
    return NextResponse.redirect(`${settingsBack}?error=state-mismatch`);
  }
  const { tenantId } = cookieData;

  // ── Google family ─────────────────────────────────────────────────────
  if (provider === 'gmail' || provider === 'google_calendar') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${settingsBack}?error=google-unconfigured`);
    }
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${appUrl}/api/oauth/${provider}/callback`,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text();
        logger.warn({ provider, status: tokenRes.status, detail: detail.slice(0, 200) }, 'oauth.token-exchange.failed');
        return NextResponse.redirect(`${settingsBack}?error=token-exchange`);
      }
      const tokens = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };

      // Look up the connected account email for the Integration label.
      let accountEmail: string | null = null;
      try {
        const profRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { authorization: `Bearer ${tokens.access_token}` },
        });
        if (profRes.ok) {
          const prof = (await profRes.json()) as { email?: string };
          accountEmail = prof.email ?? null;
        }
      } catch { /* non-critical */ }

      // Upsert the Integration row (scope='tenant').
      await prisma.integration.upsert({
        where: {
          scope_tenantId_provider: { scope: 'tenant', tenantId, provider },
        },
        create: {
          scope: 'tenant',
          tenantId,
          provider,
          status: 'CONNECTED',
          accountEmail,
          credentials: encryptCredentials({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? '',
          }) as unknown as object,
          scopes: tokens.scope ? (tokens.scope.split(' ') as unknown as object) : undefined,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        },
        update: {
          status: 'CONNECTED',
          accountEmail,
          credentials: encryptCredentials({
            accessToken: tokens.access_token,
            // Don't blow away an existing refresh_token if Google didn't send a fresh one
            // (it only returns refresh_token on first consent with `prompt=consent`).
            ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
          }) as unknown as object,
          scopes: tokens.scope ? (tokens.scope.split(' ') as unknown as object) : undefined,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          lastError: null,
        },
      });

      return NextResponse.redirect(`${settingsBack}?connected=${provider}`);
    } catch (e) {
      logger.error({ err: (e as Error).message, provider, tenantId }, 'oauth.callback.failed');
      return NextResponse.redirect(`${settingsBack}?error=callback-exception`);
    }
  }

  // ── Other providers ───────────────────────────────────────────────────
  return NextResponse.redirect(`${settingsBack}?error=provider-not-supported`);
}
