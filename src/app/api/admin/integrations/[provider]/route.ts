/**
 * Connect / disconnect a platform-scoped integration.
 *
 * PUT  /api/admin/integrations/[provider]  apiKey-kind connect (credentials in body)
 * DELETE /api/admin/integrations/[provider]  disconnect
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { getSpec } from '@/lib/integrations/registry';
import { encryptCredentials } from '@/lib/integrations/crypto';

const bodySchema = z.object({
  credentials: z.record(z.string().min(1)),
  displayName: z.string().max(80).optional(),
  config: z.record(z.unknown()).optional(),
});

async function requireAdmin() {
  const s = await getPlatformSession();
  if (!s) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (s.role === 'READONLY') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session: s };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const a = await requireAdmin();
  if ('error' in a) return a.error;

  const spec = getSpec(provider);
  if (!spec) return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  if (spec.scope !== 'platform') return NextResponse.json({ error: 'Not a platform-scope integration' }, { status: 400 });
  if (spec.kind !== 'apiKey') return NextResponse.json({ error: `${provider} uses ${spec.kind}` }, { status: 400 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const required = (spec.fields ?? []).filter((f) => f.required).map((f) => f.key);
  for (const k of required) {
    if (!parsed.data.credentials[k]) {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  const encrypted = encryptCredentials(parsed.data.credentials);

  // The @@unique([scope, tenantId, provider]) in Prisma doesn't enforce
  // uniqueness when tenantId is NULL (Postgres NULL semantics) — so we do a
  // find-then-update / create dance instead of upsert.
  const existing = await prisma.integration.findFirst({
    where: { scope: 'platform', provider },
  });
  const row = existing
    ? await prisma.integration.update({
        where: { id: existing.id },
        data: {
          status: 'CONNECTED',
          displayName: parsed.data.displayName,
          credentials: encrypted,
          config: (parsed.data.config ?? {}) as object,
          lastError: null,
        },
        select: { id: true, provider: true, status: true, displayName: true },
      })
    : await prisma.integration.create({
        data: {
          scope: 'platform',
          provider,
          status: 'CONNECTED',
          displayName: parsed.data.displayName,
          credentials: encrypted,
          config: (parsed.data.config ?? {}) as object,
        },
        select: { id: true, provider: true, status: true, displayName: true },
      });

  await prisma.platformAuditLog.create({
    data: {
      adminId: a.session.adminId,
      action: 'integration.connect',
      entity: 'Integration',
      entityId: row.id,
      payload: { provider } as object,
    },
  });

  return NextResponse.json({ integration: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const a = await requireAdmin();
  if ('error' in a) return a.error;

  await prisma.integration.updateMany({
    where: { scope: 'platform', provider },
    data: { status: 'DISCONNECTED' },
  });
  await prisma.platformAuditLog.create({
    data: {
      adminId: a.session.adminId,
      action: 'integration.disconnect',
      entity: 'Integration',
      payload: { provider } as object,
    },
  });

  return NextResponse.json({ ok: true });
}
