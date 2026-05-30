/**
 * Resolve credentials for a (provider, tenantId?) at runtime.
 *
 * Lookup order:
 *   1. Tenant-scoped Integration row (if tenantId given)
 *   2. Platform-scoped Integration row
 *   3. env vars listed in the IntegrationSpec.envKeys
 *
 * Returns CONNECTED creds + a `source` discriminator so callers can log
 * which path was used.
 */
import { prisma } from '../db';
import { getSpec } from './registry';
import { decryptCredentials } from './crypto';

export interface ResolvedIntegration {
  provider: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  source: 'tenant' | 'platform' | 'env';
  status: string;
}

export async function resolveIntegration(
  provider: string,
  tenantId?: string
): Promise<ResolvedIntegration | null> {
  const spec = getSpec(provider);
  if (!spec) return null;

  // 1. Tenant-scoped
  if (tenantId && spec.scope === 'tenant') {
    const row = await prisma.integration.findUnique({
      where: {
        scope_tenantId_provider: { scope: 'tenant', tenantId, provider },
      },
    });
    if (row && row.status === 'CONNECTED' && row.credentials) {
      return {
        provider,
        credentials: decryptCredentials(row.credentials as Record<string, string>),
        config: (row.config as Record<string, unknown>) ?? {},
        source: 'tenant',
        status: row.status,
      };
    }
  }

  // 2. Platform-scoped (fallback for tenant providers that allow it)
  if (spec.scope === 'platform' || spec.fallbackToPlatform) {
    const row = await prisma.integration.findFirst({
      where: { scope: 'platform', provider, status: 'CONNECTED' },
    });
    if (row && row.credentials) {
      return {
        provider,
        credentials: decryptCredentials(row.credentials as Record<string, string>),
        config: (row.config as Record<string, unknown>) ?? {},
        source: 'platform',
        status: row.status,
      };
    }
  }

  // 3. Env vars
  if (spec.envKeys && spec.envKeys.length > 0) {
    const creds: Record<string, string> = {};
    let anyPresent = false;
    for (const k of spec.envKeys) {
      const v = process.env[k];
      if (v) {
        creds[k] = v;
        anyPresent = true;
      }
    }
    if (anyPresent) {
      return {
        provider,
        credentials: creds,
        config: {},
        source: 'env',
        status: 'CONNECTED',
      };
    }
  }

  return null;
}

/** True if at least one of (tenant, platform, env) has CONNECTED creds. */
export async function isConfigured(provider: string, tenantId?: string): Promise<boolean> {
  return (await resolveIntegration(provider, tenantId)) !== null;
}
