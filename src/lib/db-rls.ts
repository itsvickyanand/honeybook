/**
 * RLS helper: run a unit of work with `app.current_tenant_id` bound to the
 * Postgres session for the duration of one transaction.
 *
 * Usage:
 *   await withTenant(tenantId, async (tx) => { ... });
 *
 * Guarantees:
 *  - Prisma interactive transactions ($transaction(fn)) hold a single
 *    connection from BEGIN to COMMIT/ROLLBACK. SET LOCAL is scoped to that
 *    transaction, so it cannot leak to a different tenant on the same pooled
 *    connection — at COMMIT/ROLLBACK Postgres resets the GUC.
 *  - prisma/rls.sql FORCEs RLS on every tenant-scoped table, so even the
 *    table owner (i.e. neondb_owner on Neon) is subject to the policy. A
 *    query made outside withTenant() will see zero rows because
 *    current_setting('app.current_tenant_id', true) returns NULL and the
 *    USING clause evaluates to NULL (fail closed).
 *
 * Do not call other Prisma model methods on the global `prisma` client from
 * inside the callback — use the provided `tx` so the queries run inside the
 * same transaction and therefore see the SET LOCAL.
 */
import { prisma } from './db';
import type { Prisma } from '@prisma/client';

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts?: { timeoutMs?: number; maxWaitMs?: number }
): Promise<T> {
  // cuid ids are [a-z0-9]+; reject anything else to keep the SET LOCAL safe.
  if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error('Invalid tenant id');

  // Prisma's default interactive-transaction timeout is 5s. That's fine for
  // request-scoped work but too tight for provisioning, where we run ~50
  // sequential inserts across Vercel→Neon pooler latency. Callers that need
  // longer can pass timeoutMs.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      return fn(tx);
    },
    {
      maxWait: opts?.maxWaitMs ?? 5_000,
      timeout: opts?.timeoutMs ?? 15_000,
    }
  );
}
