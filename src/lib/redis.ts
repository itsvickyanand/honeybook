/**
 * Two Redis clients:
 *   - generic — used for sessions, cache, rate limiting (synchronous-feeling commands)
 *   - bullmq  — separate connection BullMQ requires (maxRetriesPerRequest: null)
 *
 * In dev they point at the same instance. In prod, point them at different
 * managed Redis instances per BRD Addendum Fix 17.
 */
import IORedis from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6380';

declare global {
  // eslint-disable-next-line no-var
  var __redis: { generic?: IORedis; bullmq?: IORedis } | undefined;
}

const g = (global.__redis ??= {});

export function redis(): IORedis {
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

export function redisForBullMQ(): IORedis {
  if (!g.bullmq) {
    g.bullmq = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    g.bullmq.on('error', (err) => console.error('[redis-bullmq]', err.message));
  }
  return g.bullmq;
}
