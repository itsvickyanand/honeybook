import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { specsForScope } from '@/lib/integrations/registry';
import { TenantIntegrationsManager } from './TenantIntegrationsManager';

export const dynamic = 'force-dynamic';

/**
 * Tenant-scoped integrations manager.
 *
 * Lists every business-level integration from the registry, shows its current
 * state (Connected / Demo / Not configured), and surfaces a Connect button
 * that opens an inline credentials form. After save, the resolver picks up the
 * tenant row on the next API call — adapters need no further changes.
 */
export default async function IntegrationsPage() {
  const ctx = await requireContext();
  const specs = specsForScope('tenant');
  const rows = await prisma.integration.findMany({
    where: { tenantId: ctx.tenant.id },
    select: { provider: true, status: true, displayName: true, accountEmail: true, updatedAt: true },
  });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const cards = specs.map((s) => {
    const row = byProvider.get(s.provider);
    const envFallback = (s.envKeys ?? []).some((k) => !!process.env[k]);
    return {
      provider: s.provider,
      displayName: s.displayName,
      description: s.description,
      category: s.category,
      kind: s.kind,
      docsUrl: s.docsUrl,
      fields: s.fields ?? [],
      oauthCallback: s.oauthCallback,
      status: row?.status ?? 'DISCONNECTED',
      displayLabel: row?.displayName ?? row?.accountEmail ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      // "demo" = no tenant row OR row is DISCONNECTED, but the platform env
      // vars are present so the integration *will work* via the resolver
      // fallback. Useful to surface the "you're running on platform creds"
      // warning that nudges the vendor to BYO.
      demoFallbackActive: envFallback && row?.status !== 'CONNECTED',
    };
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Integrations</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Connect your tools so payments, e-signatures, emails, and WhatsApp run under your own account.
          </p>
        </div>
        <TenantIntegrationsManager cards={cards} />
      </div>
    </PageTransition>
  );
}
