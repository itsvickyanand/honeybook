import { Job } from 'bullmq';
import { logger } from '../../lib/logger';
import { resolveIntegration } from '../../lib/integrations/resolve';

/**
 * SMS send via MSG91.
 *
 * MSG91 is a strange case: OTP-for-login goes via the platform's account (it's
 * an auth utility, not vendor-branded). But transactional SMS to clients — like
 * booking confirmations or payment reminders — should send under the VENDOR's
 * MSG91 account so their sender ID + DLT registrations apply. If a vendor has
 * BYO creds, we use them; otherwise we fall back to platform (with the platform
 * sender ID, which is fine for auth-style sends but not for client-facing).
 */
export async function handleSmsSend(job: Job): Promise<unknown> {
  const data = job.data as { to: string; body: string; senderId?: string; tenantId?: string };

  let key: string | undefined;
  let sender: string | undefined = data.senderId;
  if (data.tenantId) {
    const resolved = await resolveIntegration('msg91', data.tenantId);
    if (resolved && resolved.source === 'tenant') {
      key = resolved.credentials.authKey;
      sender = data.senderId ?? resolved.credentials.senderId ?? sender;
    }
  }
  if (!key) {
    key = process.env.MSG91_AUTH_KEY;
    sender = sender ?? 'AVANTS';
  }
  if (!key) {
    logger.warn({ to: data.to, tenantId: data.tenantId ?? null }, 'sms.dev-mode-no-send');
    return { mocked: true };
  }
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: key, 'content-type': 'application/json' },
    body: JSON.stringify({
      mobiles: data.to.replace(/^\+/, ''),
      sender: sender ?? 'AVANTS',
      message: data.body,
    }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
  return res.json();
}
