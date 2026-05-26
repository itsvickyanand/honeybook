/**
 * RLS helper: run a unit of work with `app.current_tenant_id` set on the
 * underlying Postgres session for the duration of the transaction.
 *
 * Usage:
 *   await withTenant(tenantId, async (tx) => { ... });
 *
 * Notes:
 *  - Uses Prisma interactive transactions; `SET LOCAL` is bound to the txn.
 *  - When you connect with the owner role (default in dev), RLS is bypassed
 *    even with this helper — so RLS is purely a production-side backstop.
 */
import { prisma } from './db';
import type { Prisma } from '@prisma/client';

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // SET LOCAL with parameter binding doesn't work; safe-escape the UUID.
    if (!/^[a-z0-9]+$/i.test(tenantId)) throw new Error('Invalid tenant id');
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
    return fn(tx);
  });
}
