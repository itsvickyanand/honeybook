import { Job } from 'bullmq';
import { Resend } from 'resend';
import { logger } from '../../lib/logger';

/**
 * Email send handler.
 * Uses Resend when RESEND_API_KEY is set; otherwise logs the payload (dev).
 */
export async function handleEmailSend(job: Job): Promise<unknown> {
  const data = job.data as {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    from?: string;
  };
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn({ to: data.to, subject: data.subject }, 'email.dev-mode-no-send');
    return { mocked: true };
  }
  const client = new Resend(apiKey);
  // Use the verified sender from env; never fall back to an unverified domain —
  // Resend rejects sends from domains it hasn't verified.
  const from = data.from ?? process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const res = await client.emails.send({
    from,
    to: data.to,
    subject: data.subject,
    html: data.html,
    text: data.text ?? '',
  });
  if (res.error) {
    logger.error({ to: data.to, from, err: res.error }, 'email.send.failed');
    throw new Error(`Resend: ${res.error.message ?? 'send failed'}`);
  }
  logger.info({ to: data.to, id: res.data?.id }, 'email.sent');
  return res;
}
