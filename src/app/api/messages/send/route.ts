/**
 * Unified vendor outbound messaging.
 * Channels: email | sms | whatsapp.
 * Optionally attached to a contact/proposal/invoice for the activity log.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { sendEmail, sendSms, sendWhatsApp } from '@/lib/comms';
import { logActivity } from '@/lib/lifecycle';
import { audit } from '@/lib/audit';

const schema = z.object({
  channel: z.enum(['email', 'sms', 'whatsapp']),
  to: z.string().min(3).max(200),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  contactId: z.string().optional(),
  proposalId: z.string().optional(),
  invoiceId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const { channel, to, subject, body, contactId, proposalId, invoiceId } = parsed.data;

  if (channel === 'email') {
    if (!subject) return NextResponse.json({ error: 'subject required for email' }, { status: 400 });
    await sendEmail({
      to,
      subject,
      text: body,
      html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif">${body.replace(/\n/g, '<br/>')}</div>`,
    });
  } else if (channel === 'sms') {
    await sendSms({ to, body });
  } else if (channel === 'whatsapp') {
    await sendWhatsApp({ to, type: 'text', body });
  }

  // Activity log
  await logActivity({
    tenantId: auth.tenant.id,
    contactId,
    type: channel === 'email' ? 'EMAIL' : channel === 'sms' ? 'SMS' : 'WHATSAPP',
    title: subject ?? `${channel.toUpperCase()} sent`,
    body: body.slice(0, 200),
    meta: { proposalId, invoiceId, to } as object,
  });

  // Optional: create / extend ChatThread for proposal-scoped messages so the inbox reflects it
  if (proposalId) {
    let thread = await prisma.chatThread.findFirst({
      where: { tenantId: auth.tenant.id, proposalId, channel: channel === 'email' ? 'EMAIL' : channel.toUpperCase() },
    });
    if (!thread) {
      thread = await prisma.chatThread.create({
        data: {
          tenantId: auth.tenant.id,
          proposalId,
          contactId: contactId ?? undefined,
          channel: channel === 'email' ? 'EMAIL' : channel.toUpperCase(),
          externalId: to,
          lastMessageAt: new Date(),
        },
      });
    }
    await prisma.message.create({
      data: {
        threadId: thread.id,
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        direction: 'OUTBOUND',
        body,
        status: 'SENT',
      },
    });
    await prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  }

  await audit({
    tenantId: auth.tenant.id,
    userId: auth.user.id,
    action: 'send',
    entity: 'Message',
    entityId: contactId ?? proposalId ?? invoiceId,
    diff: { channel, to } as object,
  });

  return NextResponse.json({ ok: true });
}
