import { NextResponse } from 'next/server';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { specsForScope } from '@/lib/integrations/registry';

export async function GET() {
  const session = await getPlatformSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const specs = specsForScope('platform');
  const rows = await prisma.integration.findMany({ where: { scope: 'platform' } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return NextResponse.json({
    integrations: specs.map((s) => {
      const row = byProvider.get(s.provider);
      return {
        ...s,
        connected: row?.status === 'CONNECTED',
        status: row?.status ?? 'DISCONNECTED',
        accountEmail: row?.accountEmail ?? null,
        lastError: row?.lastError ?? null,
      };
    }),
  });
}
