// Proxy a Twilio recording so the browser can play it without exposing
// credentials. Twilio recording media requires authentication; we fetch it with
// the API key/secret and stream the audio back. Auth-gated to logged-in users.
import { getCurrentContext } from '@/lib/session';
import { getDialerConfig } from '@/dialer/server/config.js';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ sid: string }> }
) {
  const session = await getCurrentContext();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { sid } = await ctx.params;
  try {
    const config = getDialerConfig();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Recordings/${sid}.mp3`;
    const auth = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');

    const upstream = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!upstream.ok) {
      return new Response('Recording unavailable', { status: upstream.status });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[dialer] recording proxy error:', error);
    return new Response('Recording error', { status: 500 });
  }
}
