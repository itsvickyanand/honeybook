import { Job } from 'bullmq';
import { logger } from '../../lib/logger';

/**
 * WhatsApp send via configured BSP.
 * Currently supports Meta Cloud API directly + falls back to dev mock.
 */
export async function handleWhatsappSend(job: Job): Promise<unknown> {
  const data = job.data as {
    to: string;
    type: 'template' | 'text';
    template?: { name: string; languageCode: string; components?: unknown[] };
    body?: string;
  };
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) {
    logger.warn({ to: data.to, type: data.type }, 'whatsapp.dev-mode-no-send');
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
