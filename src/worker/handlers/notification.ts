import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { enqueue, JOB_NAMES } from '../../lib/queue';

/**
 * Fan a notification out to all configured channels for a user/tenant.
 * The MVP just persists an in-app Notification row + fires an email if email
 * is the channel.
 */
export async function handleNotificationDispatch(job: Job): Promise<unknown> {
  const data = job.data as {
    tenantId: string;
    userId?: string;
    type: string;
    title: string;
    body?: string;
    href?: string;
    channels?: ('inapp' | 'email' | 'sms' | 'whatsapp')[];
    to?: { email?: string; phone?: string };
  };
  const channels = data.channels ?? ['inapp'];
  await prisma.notification.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      href: data.href,
    },
  });
  if (channels.includes('email') && data.to?.email) {
    await enqueue(JOB_NAMES.EMAIL_SEND, {
      to: data.to.email,
      subject: data.title,
      text: data.body ?? '',
      html: `<p>${data.body ?? ''}</p>${data.href ? `<p><a href="${data.href}">Open</a></p>` : ''}`,
    });
  }
  if (channels.includes('sms') && data.to?.phone) {
    await enqueue(JOB_NAMES.SMS_SEND, { to: data.to.phone, body: data.title });
  }
  return { ok: true };
}
