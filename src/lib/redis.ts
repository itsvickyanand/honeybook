/**
 * Two Redis clients:
 *   - generic — used for sessions, cache, rate limiting (synchronous-feeling commands)
 *   - bullmq  — separate connection BullMQ requires (maxRetriesPerRequest: null)
 *
 * In dev they point at the same instance. In prod, point them at different
 * managed Redis instances per BRD Addendum Fix 17.
 *
 * Resilience: when REDIS_URL is unset (or points at localhost on Vercel)
 * we treat Redis as unavailable rather than spinning a client that loops on
 * ECONNREFUSED forever. Callers can branch via `redisOrNull()` to degrade
 * gracefully — see src/lib/rate-limit.ts and src/lib/queue.ts.
 */
import IORedis from 'ioredis';

const RAW_URL = process.env.REDIS_URL ?? '';
const url = RAW_URL || 'redis://localhost:6379';

function isUnreachable(): boolean {
  if (!RAW_URL) return true;
  if (process.env.VERCEL === '1' && /(localhost|127\.0\.0\.1)/.test(RAW_URL)) return true;
  return false;
}

declare global {
  // eslint-disable-next-line no-var
  var __redis: { generic?: IORedis; bullmq?: IORedis } | undefined;
}

const g = (global.__redis ??= {});

export class RedisUnavailableError extends Error {
  constructor() {
    super('REDIS_URL not configured');
    this.name = 'RedisUnavailableError';
  }
}

/**
 * Returns a connected ioredis client, or throws RedisUnavailableError if
 * REDIS_URL is unset. Callers that want to degrade gracefully should catch
 * or use {@link redisOrNull}.
 */
export function redis(): IORedis {
  if (isUnreachable()) throw new RedisUnavailableError();
  if (!g.generic) {
    g.generic = new IORedis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    g.generic.on('error', (err) => console.error('[redis]', err.message));
  }
  return g.generic;
}

/** Safe variant: returns null instead of throwing. */
export function redisOrNull(): IORedis | null {
  try {
    return redis();
  } catch {
    return null;
  }
}

export function redisForBullMQ(): IORedis {
  if (isUnreachable()) throw new RedisUnavailableError();
  if (!g.bullmq) {
    g.bullmq = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    g.bullmq.on('error', (err) => console.error('[redis-bullmq]', err.message));
  }
  return g.bullmq;
}
