/**
 * Connect / disconnect a tenant integration.
 *
 * PUT /api/integrations/[provider] — accepts apiKey-kind credential fields,
 * encrypts them, upserts the Integration row.
 *
 * DELETE /api/integrations/[provider] — disconnect (marks row DISCONNECTED;
 * keeps row so OAuth refresh-token revocation can be retried).
 *
 * For oauth-kind integrations the connect entry point is /api/oauth/<provider>/start,
 * not this PUT endpoint.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getSpec } from '@/lib/integrations/registry';
import { encryptCredentials } from '@/lib/integrations/crypto';

const bodySchema = z.object({
  credentials: z.record(z.string().min(1)),
  displayName: z.string().max(80).optional(),
  config: z.record(z.unknown()).optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;

  const spec = getSpec(provider);
  if (!spec || spec.scope !== 'tenant') {
    return NextResponse.json({ error: 'Unknown tenant integration' }, { status: 404 });
  }
  if (spec.kind !== 'apiKey') {
    return NextResponse.json(
      { error: `${provider} uses ${spec.kind}; use /api/oauth/${provider}/start instead` },
      { status: 400 }
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // Validate required fields
  const required = (spec.fields ?? []).filter((f) => f.required).map((f) => f.key);
  for (const k of required) {
    if (!parsed.data.credentials[k]) {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  const encrypted = encryptCredentials(parsed.data.credentials);

  const row = await prisma.integration.upsert({
    where: {
      scope_tenantId_provider: { scope: 'tenant', tenantId: auth.tenant.id, provider },
    },
    create: {
      scope: 'tenant',
      tenantId: auth.tenant.id,
      provider,
      status: 'CONNECTED',
      displayName: parsed.data.displayName,
      credentials: encrypted,
      config: (parsed.data.config ?? {}) as object,
    },
    update: {
      status: 'CONNECTED',
      displayName: parsed.data.displayName,
      credentials: encrypted,
      config: (parsed.data.config ?? {}) as object,
      lastError: null,
    },
    select: {
      id: true, provider: true, status: true, displayName: true, lastSyncAt: true,
    },
  });
  return NextResponse.json({ integration: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;

  await prisma.integration.updateMany({
    where: { scope: 'tenant', tenantId: auth.tenant.id, provider },
    data: { status: 'DISCONNECTED' },
  });
  return NextResponse.json({ ok: true });
}
