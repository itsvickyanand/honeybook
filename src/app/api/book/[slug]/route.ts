/**
 * Public: create a booking for a meeting type.
 *   POST { startAt, name, email, phone?, notes? }
 * → creates/links a Contact, creates a CalendarEvent (CONFIRMED), optionally
 * spawns a Lead, emails an ICS confirmation. Returns reschedule/cancel token.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/comms';
import { buildIcs } from '@/lib/calendar/ics';
import { pushUserEvent } from '@/lib/calendar/google-user';
import { logger } from '@/lib/logger';
import { checkBotId } from 'botid/server';

const schema = z.object({
  startAt: z.string().datetime(),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // BotID — log-only by default. Without the client-side <BotIdClient />
  // component on the page, all server checks return isBot:true and would
  // silent-drop legit users. Enforcement gated behind BOTID_ENFORCE=true.
  try {
    const verdict = await checkBotId();
    if (verdict.isBot) {
      logger.warn({ slug, reason: 'botid' }, 'book.bot-flagged');
      if (process.env.BOTID_ENFORCE === 'true') {
        return NextResponse.json({ ok: true });
      }
    }
  } catch {
    // BotID not configured — fall through.
  }

  const m = await prisma.meetingType.findFirst({ where: { slug, active: true, archived: false }, include: { tenant: true, hostUser: { select: { fullName: true, email: true } } } });
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const start = new Date(parsed.data.startAt);
  const end = new Date(start.getTime() + m.durationMins * 60_000);

  // Conflict check (idempotent-ish; double-clicks won't double-book).
  if (m.hostUserId) {
    const overlap = await prisma.calendarEvent.findFirst({
      where: {
        tenantId: m.tenantId,
        hostUserId: m.hostUserId,
        status: { not: 'CANCELLED' },
        startAt: { lt: end },
        endAt: { gt: start },
      },
      select: { id: true },
    });
    if (overlap) return NextResponse.json({ error: 'That slot just got taken — please pick another.' }, { status: 409 });
  }

  // Find or create contact (per tenant).
  const existing = await prisma.contact.findFirst({ where: { tenantId: m.tenantId, email: parsed.data.email } });
  const contact = existing
    ? existing
    : await prisma.contact.create({
        data: {
          tenantId: m.tenantId,
          fullName: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          source: 'booking',
        },
      });

  // Auto-create a Lead so the booking lands in the pipeline.
  let leadId: string | undefined;
  const pipeline = await prisma.pipeline.findFirst({ where: { tenantId: m.tenantId, isDefault: true }, include: { stages: { orderBy: { sortOrder: 'asc' }, take: 1 } } });
  if (pipeline && pipeline.stages[0]) {
    const lead = await prisma.lead.create({
      data: {
        tenantId: m.tenantId,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        contactId: contact.id,
        title: `${m.name} with ${parsed.data.name}`,
        source: 'booking',
        notes: parsed.data.notes,
      },
    });
    leadId = lead.id;
  }

  const bookingToken = randomBytes(18).toString('base64url');

  // If location is Google Meet AND the host has Google Calendar connected,
  // push the event to Google first to auto-generate a Meet link.
  let videoUrl: string | undefined = undefined;
  let externalProvider: string | undefined = undefined;
  let externalId: string | undefined = undefined;
  if (m.hostUserId) {
    if (m.locationType === 'GOOGLE_MEET') {
      const pushed = await pushUserEvent(m.hostUserId, null, {
        summary: `${m.name} with ${parsed.data.name}`,
        description: parsed.data.notes ?? `Booking via ${m.tenant.name}.`,
        start, end,
        attendees: [{ email: parsed.data.email, name: parsed.data.name }],
        addMeetLink: true,
      }).catch((e) => { logger.warn({ err: (e as Error).message }, 'book.google-push.failed'); return null; });
      if (pushed?.hangoutLink) { videoUrl = pushed.hangoutLink; externalProvider = 'google'; externalId = pushed.externalId; }
    } else if (m.locationType === 'ZOOM' || m.locationType === 'CUSTOM') {
      videoUrl = m.locationDetail ?? undefined;
    }
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: m.tenantId,
      title: `${m.name} · ${parsed.data.name}`,
      description: parsed.data.notes,
      startAt: start,
      endAt: end,
      kind: 'MEETING',
      type: 'BOOKING',
      status: 'CONFIRMED',
      hostUserId: m.hostUserId,
      meetingTypeId: m.id,
      contactId: contact.id,
      leadId,
      location: m.locationType === 'IN_PERSON' ? m.locationDetail : undefined,
      videoUrl,
      externalProvider,
      externalId,
      bookingToken,
    },
  });

  // Send ICS confirmation to client (and host).
  const icsText = buildIcs({
    uid: event.id + '@avantus',
    start, end,
    summary: `${m.name} with ${m.tenant.name}`,
    description: parsed.data.notes,
    location: m.locationType === 'IN_PERSON' ? m.locationDetail ?? undefined : event.videoUrl ?? undefined,
    organizerName: m.hostUser?.fullName, organizerEmail: m.hostUser?.email,
    attendeeName: parsed.data.name, attendeeEmail: parsed.data.email,
  });
  const dataUrl = `data:text/calendar;charset=utf-8;base64,${Buffer.from(icsText, 'utf8').toString('base64')}`;
  const when = start.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
  await sendEmail({
    tenantId: m.tenantId,
    to: parsed.data.email,
    subject: `Booking confirmed: ${m.name} on ${start.toLocaleDateString('en-IN')}`,
    html: `<p>Hi ${parsed.data.name},</p>
<p>Your <strong>${m.name}</strong> with ${m.tenant.name} is confirmed for <strong>${when} IST</strong>.</p>
${event.videoUrl ? `<p>Join here: <a href="${event.videoUrl}">${event.videoUrl}</a></p>` : ''}
${m.locationType === 'IN_PERSON' && m.locationDetail ? `<p>Where: ${m.locationDetail}</p>` : ''}
<p style="margin:24px 0"><a href="${dataUrl}" download="invite.ics" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Add to my calendar</a></p>
<p style="color:#666;font-size:12px">Need to reschedule or cancel? Use this link: ${process.env.APP_URL ?? ''}/book/manage/${bookingToken}</p>`,
  }).catch(() => {});

  if (m.hostUser?.email) {
    await sendEmail({
      tenantId: m.tenantId,
      to: m.hostUser.email,
      subject: `New booking: ${m.name} with ${parsed.data.name}`,
      html: `<p>${parsed.data.name} (${parsed.data.email}) booked <strong>${m.name}</strong> on ${when}.</p>${parsed.data.notes ? `<p>Notes: ${parsed.data.notes}</p>` : ''}<p>View: ${process.env.APP_URL ?? ''}/app/calendar</p>`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, bookingToken, when: start.toISOString() }, { status: 201 });
}
