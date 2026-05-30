/**
 * API route helpers.
 * - requireApi: session + permission gate
 * - apiHandler: wraps a handler with structured logging + error capture
 * - Rate-limit helpers
 */
import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { prisma } from './db';
import { hasPermission, parsePermissions } from './session';
import { logger } from './logger';
import { captureException } from './sentry';
import { rateLimit, rlHeaders, RateLimitArgs } from './rate-limit';

export async function requireApi(permission?: string) {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const user = await prisma.user.findUnique({
    where: { id: s.userId },
    include: { role: true, tenant: true },
  });
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (permission) {
    const perms = parsePermissions(user.role.permissions as unknown);
    if (!hasPermission(perms, permission)) {
      return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
  }
  return { user, tenant: user.tenant, role: user.role };
}

/**
 * Enforce per-IP rate limit for unauthenticated endpoints.
 * Use on /api/auth/*, public webhook endpoints, and /api/share/* writes.
 */
export async function enforceRateLimit(req: Request, args: Omit<RateLimitArgs, 'key'> & { keyPrefix: string }) {
  const ip = ipOf(req);
  const result = await rateLimit({ key: `${args.keyPrefix}:${ip}`, limit: args.limit, windowMs: args.windowMs });
  if (!result.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rlHeaders(result) }
    );
  }
  return null;
}

function ipOf(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

/**
 * Wrap a route handler with structured logging + error capture.
 *
 * Usage:
 *   export const POST = apiHandler(async (req) => { ... });
 */
export function apiHandler<T extends unknown[]>(
  fn: (req: Request, ...args: T) => Promise<Response>
) {
  return async (req: Request, ...args: T): Promise<Response> => {
    const start = Date.now();
    const url = new URL(req.url);
    try {
      const res = await fn(req, ...args);
      logger.info(
        { method: req.method, path: url.pathname, status: res.status, ms: Date.now() - start },
        'http'
      );
      return res;
    } catch (e) {
      captureException(e, { path: url.pathname, method: req.method });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
