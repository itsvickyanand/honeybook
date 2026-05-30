import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ApiKeysClient } from './ApiKeysClient';

export default async function ApiKeysPage() {
  const ctx = await requireContext();
  const [keys, hooks] = await Promise.all([
    prisma.apiKey.findMany({ where: { tenantId: ctx.tenant.id, revokedAt: null }, orderBy: { createdAt: 'desc' } }),
    prisma.outboundWebhook.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: 'desc' } }),
  ]);
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-4xl mx-auto">
        <h1 className="text-3xl font-semibold">API & webhooks</h1>
        <p className="mt-1 text-[var(--color-muted)]">Build integrations on top of your tenant&apos;s data.</p>
        <ApiKeysClient
          initialKeys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))}
          initialHooks={hooks.map((h) => ({ id: h.id, url: h.url, active: h.active, events: (h.events as unknown as string[]) ?? [] }))}
        />
      </div>
    </PageTransition>
  );
}
