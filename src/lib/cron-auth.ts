/**
 * Shared helper for cron route handlers.
 *
 * Vercel cron sets `x-vercel-cron: 1`. In production we trust it. If
 * CRON_SECRET is set, we also accept Authorization: Bearer <secret> from any
 * external scheduler (handy during local dev).
 */
export function isAuthedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${secret}`) return true;
  }
  return req.headers.get('x-vercel-cron') === '1';
}
