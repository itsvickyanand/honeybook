/**
 * GET /api/integrations — list the catalog of tenant-scoped integrations with
 * each one's current connection status for the current tenant.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { specsForScope } from '@/lib/integrations/registry';

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;

  const specs = specsForScope('tenant');
  const rows = await prisma.integration.findMany({
    where: { scope: 'tenant', tenantId: auth.tenant.id },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return NextResponse.json({
    integrations: specs.map((s) => {
      const row = byProvider.get(s.provider);
      return {
        ...s,
        // Don't ship credentials to the client.
        connected: row?.status === 'CONNECTED',
        status: row?.status ?? 'DISCONNECTED',
        accountEmail: row?.accountEmail ?? null,
        displayLabel: row?.displayName ?? null,
        lastSyncAt: row?.lastSyncAt ?? null,
        lastError: row?.lastError ?? null,
      };
    }),
  });
}
