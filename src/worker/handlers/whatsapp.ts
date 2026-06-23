import { Job } from 'bullmq';
import { logger } from '../../lib/logger';
import { resolveIntegration } from '../../lib/integrations/resolve';

/**
 * WhatsApp send via configured BSP.
 *
 * Per-tenant credentials (Meta WhatsApp Business Account):
 *   1. Per-tenant Integration row: each vendor onboards their own WABA via
 *      Meta's Embedded Signup (Phase 3) or pastes token + phone-id.
 *   2. Platform env vars (WHATSAPP_TOKEN, WHATSAPP_PHONE_ID) — demo mode only,
 *      should NOT be used in production: running multiple vendors through one
 *      WABA violates Meta TOS.
 *   3. No-key dev mode: log and skip.
 */
export async function handleWhatsappSend(job: Job): Promise<unknown> {
  const data = job.data as {
    to: string;
    type: 'template' | 'text';
    template?: { name: string; languageCode: string; components?: unknown[] };
    body?: string;
    tenantId?: string;
  };

  let token: string | undefined;
  let phoneId: string | undefined;
  if (data.tenantId) {
    const resolved = await resolveIntegration('whatsapp_bsp', data.tenantId);
    if (resolved && resolved.source === 'tenant') {
      token = resolved.credentials.token;
      phoneId = resolved.credentials.phoneId;
    }
  }
  if (!token || !phoneId) {
    token = token ?? process.env.WHATSAPP_TOKEN;
    phoneId = phoneId ?? process.env.WHATSAPP_PHONE_ID;
  }
  if (!token || !phoneId) {
    logger.warn({ to: data.to, type: data.type, tenantId: data.tenantId ?? null }, 'whatsapp.dev-mode-no-send');
    return { mocked: true };
  }

  const payload =
    data.type === 'template'
      ? {
          messaging_product: 'whatsapp',
          to: data.to,
          type: 'template',
          template: {
            name: data.template!.name,
            language: { code: data.template!.languageCode },
            components: data.template!.components ?? [],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: data.to,
          type: 'text',
          text: { body: data.body },
        };

  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}
