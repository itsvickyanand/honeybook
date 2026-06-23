/**
 * "What's in demo mode for this tenant?" — a single helper any server page can
 * call to drive the DemoModeBanner.
 *
 * Demo mode = the integration WILL work (via the env-vars fallback in the
 * resolver) but the tenant hasn't connected their own account yet. Returns the
 * subset of providers that are running on platform credentials right now.
 */
import { prisma } from '../db';
import { specsForScope } from './registry';

const PRIORITY_PROVIDERS = ['razorpay', 'docusign', 'digio', 'resend', 'whatsapp_bsp', 'gst_irp'];

export async function getDemoModeProviders(tenantId: string): Promise<string[]> {
  const specs = specsForScope('tenant');
  const rows = await prisma.integration.findMany({
    where: { tenantId, status: 'CONNECTED' },
    select: { provider: true },
  });
  const connected = new Set(rows.map((r) => r.provider));

  const demo: string[] = [];
  for (const s of specs) {
    if (!PRIORITY_PROVIDERS.includes(s.provider)) continue;
    if (connected.has(s.provider)) continue;
    // Only flag as demo when the env fallback IS in place — if neither tenant
    // nor env has creds, the feature is unavailable, not "demo mode".
    const envPresent = (s.envKeys ?? []).some((k) => !!process.env[k]);
    if (envPresent) demo.push(s.provider);
  }
  return demo;
}
