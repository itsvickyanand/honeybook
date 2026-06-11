// Mints a Twilio access token for the logged-in user's browser softphone.
// Scoped per-tenant via the client identity so calls stay separable.
import { getCurrentContext } from '@/lib/session';
import { createAccessToken } from '@/dialer/server/token.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }
  try {
    const { token, identity } = createAccessToken({
      identity: `dialer-${ctx.tenant.id}`,
    });
    return Response.json({ token, identity });
  } catch (error) {
    console.error('[dialer] token error:', error);
    return Response.json(
      { error: (error as Error).message || 'Failed to create access token' },
      { status: 500 }
    );
  }
}
