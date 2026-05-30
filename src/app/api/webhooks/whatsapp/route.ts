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
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{ from: string; id: string; text?: { body: string }; timestamp: string }>;
        statuses?: Array<{ id: string; status: string }>;
      };
    }>;
  }>;
}

/** Resolve the owning tenant for an inbound WhatsApp number-id. */
async function resolveTenantId(phoneNumberId?: string): Promise<string | null> {
  if (phoneNumberId) {
    const integ = await prisma.integration.findFirst({
      where: { provider: 'whatsapp_bsp', status: 'CONNECTED' },
    });
    if (integ?.tenantId && (integ.config as Record<string, unknown> | null)?.phoneId === phoneNumberId) {
      return integ.tenantId;
    }
  }
  // dev fallback: oldest tenant
  const only = await prisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
  return only?.id ?? null;
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: WaPayload;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: true }); }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const messages = change.value.messages ?? [];
      const tenantId = messages.length ? await resolveTenantId(change.value.metadata?.phone_number_id) : null;
      const profileName = change.value.contacts?.[0]?.profile?.name;
      for (const m of messages) {
        logger.info({ from: m.from, id: m.id }, 'whatsapp.inbound');
        if (!tenantId) continue;

        // Find or create contact by phone — unknown number = new lead capture.
        let contact = await prisma.contact.findFirst({ where: { tenantId, phone: m.from } });
        if (!contact) {
          contact = await prisma.contact.create({
            data: {
              tenantId,
              fullName: profileName || `WhatsApp ${m.from.slice(-4)}`,
              phone: m.from,
              source: 'whatsapp',
            },
          });
          // Open an inquiry lead in the first pipeline stage.
          const pipeline = await prisma.pipeline.findFirst({
            where: { tenantId, isDefault: true },
            include: { stages: { orderBy: { sortOrder: 'asc' }, take: 1 } },
          });
          if (pipeline?.stages[0]) {
            await prisma.lead.create({
              data: {
                tenantId,
                pipelineId: pipeline.id,
                stageId: pipeline.stages[0].id,
                contactId: contact.id,
                title: `WhatsApp inquiry — ${contact.fullName}`,
                source: 'whatsapp',
              },
            });
          }
        }
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
