/**
 * Generic OAuth start route — `/api/oauth/[provider]/start`.
 *
 * Settings → Integrations links here for any oauth-kind provider. We dispatch
 * to the right OAuth flow based on `provider`:
 *
 *   - gmail            → Google OAuth, scope `gmail.send`
 *   - google_calendar  → Google OAuth, scope `calendar.events`
 *   - calendly         → not yet implemented (cleanly error)
 *   - zoom             → not yet implemented
 *   - quickbooks       → not yet implemented
 *
 * State cookie carries (provider, tenantId, nonce) so the callback can write
 * to the correct Integration row.
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { requireContext } from '@/lib/session';
import { getSpec } from '@/lib/integrations/registry';

export const dynamic = 'force-dynamic';

const GOOGLE_SCOPES: Record<string, string> = {
  gmail: 'openid email profile https://www.googleapis.com/auth/gmail.send',
  google_calendar: 'openid email profile https://www.googleapis.com/auth/calendar.events',
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;

  // Must be a real spec — and must be oauth-kind.
  const spec = getSpec(provider);
  if (!spec) return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  if (spec.kind !== 'oauth') {
    return NextResponse.json(
      { error: `${spec.displayName} doesn't use OAuth — connect via the API key form in Settings.` },
      { status: 400 },
    );
  }

  // Logged-in tenant required so we know which Integration row to upsert.
  let tenantId: string;
  try {
    const ctx = await requireContext();
    tenantId = ctx.tenant.id;
  } catch {
    const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
    return NextResponse.redirect(`${appUrl}/login?next=/app/settings/integrations`);
  }

  // ── Google family (gmail / google_calendar) ──────────────────────────────
  if (provider === 'gmail' || provider === 'google_calendar') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { error: 'GOOGLE_CLIENT_ID not configured on the platform' },
        { status: 503 },
      );
    }
    const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
    const redirectUri = `${appUrl}/api/oauth/${provider}/callback`;
    const nonce = randomBytes(16).toString('hex');

    const jar = await cookies();
    jar.set(`oauth_state_${provider}`, JSON.stringify({ tenantId, nonce }), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 600,
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES[provider],
      state: nonce,
      access_type: 'offline',
      prompt: 'consent', // force refresh_token issuance every time
      include_granted_scopes: 'true',
    });
    return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  }

  // ── Not-yet-implemented OAuth providers ─────────────────────────────────
  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  return NextResponse.redirect(
    `${appUrl}/app/settings/integrations?error=${encodeURIComponent(
      `${spec.displayName} connect flow is on the roadmap but not yet shipped.`,
    )}`,
  );
}
