/**
 * Resolve the tenant from the inbound Host header (for custom-domain support).
 * Pass null host to skip — we keep the default subdomain/path-based routing as the primary mode.
 */
import { prisma } from './db';

export async function tenantFromHost(host: string | null) {
  if (!host) return null;
  const stripped = host.toLowerCase().replace(/:\d+$/, '');
  return prisma.tenant.findUnique({ where: { customDomain: stripped } });
}
