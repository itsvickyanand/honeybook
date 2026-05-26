import { Job } from 'bullmq';
import { logger } from '../../lib/logger';

/**
 * Outbound webhook deliveries (vendor → 3rd-party integration).
 * Skeleton — fully fleshed when we expose tenant-managed webhooks.
 */
export async function handleWebhookOutbound(job: Job): Promise<unknown> {
  const { url, payload, secret } = job.data as {
    url: string;
    payload: unknown;
    secret?: string;
  };
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-honeybook-secret': secret } : {}),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    logger.warn({ url, status: res.status, text: text.slice(0, 200) }, 'webhook.failed');
    throw new Error(`Webhook ${res.status}`);
  }
  return { ok: true };
}
