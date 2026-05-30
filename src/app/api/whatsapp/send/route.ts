/**
 * Outbound WhatsApp send (vendor → client). Authed. Logs to the thread.
 * Uses the comms facade (sendWhatsApp) which enqueues / inline-runs based on
 * Redis + BSP availability.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { sendWhatsApp } from '@/lib/comms';

const schema = z.object({
  to: z.string().min(8),
  body: z.string().min(1).max(4000),
  contactId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  await sendWhatsApp({ to: parsed.data.to, type: 'text', body: parsed.data.body }).catch(() => {});

  // Mirror into the thread if we can resolve the contact.
  if (parsed.data.contactId) {
    const thread = await prisma.chatThread.upsert({
      where: { id: `wa-${parsed.data.contactId}` },
      update: { lastMessageAt: new Date() },
      create: {
        id: `wa-${parsed.data.contactId}`,
        tenantId: auth.tenant.id,
        contactId: parsed.data.contactId,
        channel: 'WHATSAPP',
        externalId: parsed.data.to,
        lastMessageAt: new Date(),
      },
    });
    await prisma.message.create({
      data: {
        threadId: thread.id,
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        direction: 'OUTBOUND',
        body: parsed.data.body,
        status: 'SENT',
      },
    });
  }

  return NextResponse.json({ ok: true });
}
