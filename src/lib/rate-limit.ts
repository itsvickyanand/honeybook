/**
 * Sliding-window rate limiter backed by Redis.
 * Use as: `await rateLimit({ key: \`auth:\${ip}\`, limit: 10, windowMs: 60_000 })`.
 *
 * If Redis is unreachable, the limiter fails open (returns allowed=true) so
 * a Redis outage doesn't break the API. Production should swap this to fail
 * closed for sensitive endpoints (login, signup, password reset).
 */
import { redis } from './redis';

export interface RateLimitArgs {
  key: string;
  limit: number;
  windowMs: number;
}
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export async function rateLimit({ key, limit, windowMs }: RateLimitArgs): Promise<RateLimitResult> {
  const now = Date.now();
  const cutoff = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  const fullKey = `rl:${key}`;

  try {
    const r = redis();
    // Pipeline: trim expired, add new, count, expire key
    const pipe = r.pipeline();
    pipe.zremrangebyscore(fullKey, 0, cutoff);
    pipe.zadd(fullKey, now, member);
    pipe.zcard(fullKey);
    pipe.pexpire(fullKey, windowMs * 2);
    const res = await pipe.exec();
    const count = Number(res?.[2]?.[1] ?? 0);
    const allowed = count <= limit;
    return {
      allowed,
      remaining: Math.max(0, limit - count),
      resetMs: windowMs,
    };
  } catch {
    // fail open
    return { allowed: true, remaining: limit, resetMs: windowMs };
  }
}

export function rlHeaders(res: RateLimitResult): Record<string, string> {
  return {
    'x-ratelimit-remaining': String(res.remaining),
    'x-ratelimit-reset': String(res.resetMs),
  };
}
