import { Job } from 'bullmq';
import { Resend } from 'resend';
import { logger } from '../../lib/logger';
import { resolveIntegration } from '../../lib/integrations/resolve';

/**
 * Email send handler.
 *
 * Resolution order for the Resend API key + From address:
 *   1. Per-tenant Integration row (vendor brought their own Resend key + verified domain)
 *   2. Platform env vars (RESEND_API_KEY, RESEND_FROM_EMAIL) — demo mode
 *   3. No-key dev mode: log and skip
 *
 * Per-tenant is the correct configuration for production: each vendor sends
 * from their own verified domain (`hello@vendorname.com`) so clients see emails
 * that match the brand, not the platform's catch-all.
 */
export async function handleEmailSend(job: Job): Promise<unknown> {
  const data = job.data as {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from?: string;
    tenantId?: string;
  };

  // 1) Per-tenant
  let apiKey: string | undefined;
  let from: string | undefined = data.from;
  if (data.tenantId) {
    const resolved = await resolveIntegration('resend', data.tenantId);
    if (resolved && resolved.source === 'tenant') {
      apiKey = resolved.credentials.apiKey;
      from = data.from ?? resolved.credentials.fromEmail ?? from;
    }
  }
  // 2) Platform fallback
  if (!apiKey) {
    apiKey = process.env.RESEND_API_KEY;
    from = from ?? process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  }
  if (!apiKey) {
    logger.warn({ to: data.to, subject: data.subject, tenantId: data.tenantId ?? null }, 'email.dev-mode-no-send');
    return { mocked: true };
  }
  const client = new Resend(apiKey);
  const res = await client.emails.send({
    from: from ?? 'onboarding@resend.dev',
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text ?? '',
  });
  if (res.error) {
    logger.error({ to: data.to, from, err: res.error, tenantId: data.tenantId ?? null }, 'email.send.failed');
    throw new Error(`Resend: ${res.error.message ?? 'send failed'}`);
  }
  logger.info({ to: data.to, id: res.data?.id, tenantId: data.tenantId ?? null }, 'email.sent');
  return res;
}
