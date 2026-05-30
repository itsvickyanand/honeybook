/**
 * Region router abstraction (BRD Addendum v1.2 Fix 14).
 *
 * Today we run a single Postgres instance. Tomorrow, when MENA traffic crosses
 * the activation threshold (latency SLO breach, regulatory mandate, or tenant
 * count), we add a second instance and route by tenant.region.
 *
 * The application code uses prismaForTenant(tenantId) instead of importing
 * the prisma singleton directly for any cross-region-safe path. This file
 * keeps the abstraction in place even when only one region exists so the
 * future switch is config-only.
 */
import { PrismaClient } from '@prisma/client';
import { prisma as defaultClient } from './db';

const clients = new Map<string, PrismaClient>();

function clientFor(region: string): PrismaClient {
  // Today both regions hit the same DB. Activate the second connection by:
  //   1. Set DATABASE_URL_MENA in env
  //   2. Replace the body below with provider-specific lookup
  if (clients.has(region)) return clients.get(region)!;
  const envKey = region === 'MENA' ? 'DATABASE_URL_MENA' : 'DATABASE_URL';
  if (region === 'IN' || !process.env[envKey]) {
    clients.set(region, defaultClient);
    return defaultClient;
  }
  const c = new PrismaClient({ datasources: { db: { url: process.env[envKey] } } });
  clients.set(region, c);
  return c;
}

/**
 * Resolve the Prisma client to use for a given tenant id.
 * Cross-region FKs are FORBIDDEN; this is enforced at write time.
 */
export async function prismaForTenant(tenantId: string): Promise<PrismaClient> {
  // Find the tenant's region. We always read this from the IN client; the
  // Tenant directory is global (every region knows about every tenant) until
  // we shard the directory itself.
  const tenant = await defaultClient.tenant.findUnique({
    where: { id: tenantId },
    select: { region: true },
  });
  return clientFor(tenant?.region ?? 'IN');
}

export function isMultiRegion(): boolean {
  return Boolean(process.env.DATABASE_URL_MENA);
}
