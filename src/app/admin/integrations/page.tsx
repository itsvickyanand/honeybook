/**
 * Platform admin — connect / disconnect platform-level integrations.
 *
 * Platform-level integrations cover services the SaaS company itself uses
 * (Calendly for sales calls, Sentry for monitoring, Cloudflare R2 for storage,
 * Anthropic for AI) and also serve as fallback credentials for tenant-level
 * integrations that opt in via fallbackToPlatform.
 */
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { specsForScope } from '@/lib/integrations/registry';
import IntegrationConnectCard from './IntegrationConnectCard';

export const dynamic = 'force-dynamic';

export default async function AdminIntegrationsPage() {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin/integrations');

  const specs = specsForScope('platform');
  const rows = await prisma.integration.findMany({ where: { scope: 'platform' } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  // Group by category for nicer UI
  const grouped = specs.reduce<Record<string, typeof specs>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platform Integrations</h1>
        <p className="text-sm text-slate-600">
          These credentials apply platform-wide. They power services every tenant uses (storage, AI, observability)
          and serve as fallbacks for tenants that haven't connected their own.
        </p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{category}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((s) => {
              const row = byProvider.get(s.provider);
              return (
                <IntegrationConnectCard
                  key={s.provider}
                  spec={{
                    provider: s.provider,
                    displayName: s.displayName,
                    description: s.description,
                    kind: s.kind,
                    docsUrl: s.docsUrl,
                    fields: s.fields,
                    oauthCallback: s.oauthCallback,
                    optional: s.optional,
                  }}
                  status={row?.status ?? 'DISCONNECTED'}
                  displayLabel={row?.displayName ?? null}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
