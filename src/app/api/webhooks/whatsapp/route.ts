/**
 * WhatsApp Cloud API webhook receiver (Meta Business Platform format).
 * - GET handles the verification challenge
 * - POST receives messages + status updates
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(req: Request) {
  // Meta verification challenge
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN ?? 'honeybook-verify')) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

interface WaPayload {
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{ from: string; id: string; text?: { body: string }; timestamp: string }>;
        statuses?: Array<{ id: string; status: string }>;
      };
    }>;
  }>;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: WaPayload;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value.messages ?? [];
      for (const m of messages) {
        // Best-effort: associate by phone to an existing contact; else create a thread for the tenant
        // that owns the inbound number (we'd look this up via WHATSAPP_PHONE_ID → tenant mapping).
        // For now, we log + drop into a system-tenant inbox if no mapping.
        logger.info({ from: m.from, id: m.id }, 'whatsapp.inbound');

        const contact = await prisma.contact.findFirst({ where: { phone: m.from } });
        if (!contact) continue;
        const thread = await prisma.chatThread.upsert({
          where: { id: `wa-${contact.id}` }, // ad-hoc id (real impl: unique index on tenant+contact+channel)
          update: { lastMessageAt: new Date() },
          create: {
            id: `wa-${contact.id}`,
            tenantId: contact.tenantId,
            contactId: contact.id,
            channel: 'WHATSAPP',
            externalId: m.from,
            lastMessageAt: new Date(),
          },
        });
        await prisma.message.create({
          data: {
            threadId: thread.id,
            tenantId: contact.tenantId,
            direction: 'INBOUND',
            body: m.text?.body ?? '',
            status: 'DELIVERED',
          },
        });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
