import { Job } from 'bullmq';
import { logger } from '../../lib/logger';

export async function handleSmsSend(job: Job): Promise<unknown> {
  const data = job.data as { to: string; body: string; senderId?: string };
  const key = process.env.MSG91_AUTH_KEY;
  if (!key) {
    logger.warn({ to: data.to }, 'sms.dev-mode-no-send');
    return { mocked: true };
  }
  // MSG91 v5 transactional flow
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: key, 'content-type': 'application/json' },
    body: JSON.stringify({
      mobiles: data.to.replace(/^\+/, ''),
      sender: data.senderId ?? 'AVANTS',
      message: data.body,
    }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${await res.text()}`);
  return res.json();
}
