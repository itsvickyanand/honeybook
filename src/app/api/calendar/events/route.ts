/**
 * Calendar aggregation endpoint.
 *
 * GET /api/calendar/events?from=ISO&to=ISO&layers=meetings,tasks,projects
 *                       &projectId=…&userId=…
 *   Returns a unified item list across the requested layers. Always:
 *     { items: CalendarItem[] }
 *   where each item has { id, kind, title, startAt, endAt, allDay, color,
 *     href, projectId, status }.
 *
 * POST /api/calendar/events   — create a manual meeting/blocked event.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { pushUserEvent } from '@/lib/calendar/google-user';
import { sendEmail } from '@/lib/comms';
import { buildIcs } from '@/lib/calendar/ics';
import { logger } from '@/lib/logger';

type Layer = 'meetings' | 'tasks' | 'projects';

export interface CalendarItem {
  id: string;
  kind: 'meeting' | 'task' | 'project';
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  href: string;
  projectId: string | null;
  status: string | null;
}

const DEFAULT_COLORS = {
  meeting: '#8b5cf6',
  task: '#3b82f6',
  project: '#f59e0b',
} as const;

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : new Date(Date.now() - 14 * 86400_000);
  const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')!) : new Date(Date.now() + 60 * 86400_000);
  const layersParam = url.searchParams.get('layers') ?? 'meetings,projects,tasks';
  const layers = new Set(layersParam.split(',').map((s) => s.trim()) as Layer[]);
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const userId = url.searchParams.get('userId') ?? undefined;

  const items: CalendarItem[] = [];

  if (layers.has('meetings')) {
    const events = await prisma.calendarEvent.findMany({
      where: {
        tenantId: auth.tenant.id,
        startAt: { gte: from, lte: to },
        ...(projectId ? { projectId } : {}),
        ...(userId ? { hostUserId: userId } : {}),
      },
      include: { meetingType: { select: { color: true } } },
      orderBy: { startAt: 'asc' },
    });
    for (const e of events) {
      items.push({
        id: e.id,
        kind: 'meeting',
        title: e.title,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        allDay: e.allDay,
        color: e.meetingType?.color ?? DEFAULT_COLORS.meeting,
        href: `/app/calendar/event/${e.id}`,
        projectId: e.projectId,
        status: e.status,
      });
    }
  }

  if (layers.has('projects')) {
    const projects = await prisma.project.findMany({
      where: {
        tenantId: auth.tenant.id,
        ...(projectId ? { id: projectId } : {}),
        ...(userId ? { ownerId: userId } : {}),
        OR: [
          { startDate: { gte: from, lte: to } },
          { endDate: { gte: from, lte: to } },
          { AND: [{ startDate: { lte: from } }, { endDate: { gte: to } }] },
        ],
      },
      select: { id: true, name: true, startDate: true, endDate: true, stage: true },
    });
    for (const p of projects) {
      if (!p.startDate && !p.endDate) continue;
      items.push({
        id: `proj-${p.id}`,
        kind: 'project',
        title: p.name,
        startAt: (p.startDate ?? p.endDate!).toISOString(),
        endAt: (p.endDate ?? p.startDate!).toISOString(),
        allDay: true,
        color: DEFAULT_COLORS.project,
        href: `/app/projects/${p.id}`,
        projectId: p.id,
        status: p.stage,
      });
    }
  }

  if (layers.has('tasks')) {
    const tasks = await prisma.task.findMany({
      where: {
        tenantId: auth.tenant.id,
        dueDate: { gte: from, lte: to },
        ...(projectId ? { projectId } : {}),
        ...(userId ? { assigneeId: userId } : {}),
        status: { notIn: ['DONE', 'CANCELLED'] },
      },
      select: { id: true, title: true, dueDate: true, projectId: true, status: true, priority: true },
    });
    for (const t of tasks) {
      if (!t.dueDate) continue;
      items.push({
        id: `task-${t.id}`,
        kind: 'task',
        title: t.title,
        startAt: t.dueDate.toISOString(),
        endAt: t.dueDate.toISOString(),
        allDay: true,
        color: t.priority === 'HIGH' ? '#ef4444' : DEFAULT_COLORS.task,
        href: t.projectId ? `/app/projects/${t.projectId}?tab=tasks` : '/app/my-work',
        projectId: t.projectId,
        status: t.status,
      });
    }
  }

  items.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return NextResponse.json({ items, from: from.toISOString(), to: to.toISOString() });
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  videoUrl: z.string().url().optional(),
  kind: z.enum(['MEETING', 'BLOCKED', 'PROJECT_MILESTONE']).optional(),
  hostUserId: z.string().optional(),
  projectId: z.string().optional(),
  contactId: z.string().optional(),
  leadId: z.string().optional(),
  meetingTypeId: z.string().optional(),
  attendeeEmail: z.string().email().optional(),
  attendeeName: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const hostUserId = parsed.data.hostUserId ?? auth.user.id;
  const kind = parsed.data.kind ?? 'MEETING';

  // Push meetings to the host's Google Calendar; auto-generate a Meet link when
  // none was supplied so the vendor doesn't have to paste one.
  let videoUrl = parsed.data.videoUrl;
  let externalProvider: string | undefined;
  let externalId: string | undefined;
  // Resolve attendee: explicit attendeeEmail wins; otherwise pull from contact.
  const contact = parsed.data.contactId
    ? await prisma.contact.findFirst({ where: { id: parsed.data.contactId, tenantId: auth.tenant.id }, select: { fullName: true, email: true } })
    : null;
  const attendeeEmail = parsed.data.attendeeEmail ?? contact?.email ?? null;
  const attendeeName = parsed.data.attendeeName ?? contact?.fullName ?? null;

  let pushedToGoogle = false;
  if (kind === 'MEETING' && hostUserId) {
    const pushed = await pushUserEvent(hostUserId, null, {
      summary: parsed.data.title,
      description: parsed.data.description,
      start: new Date(parsed.data.startAt),
      end: new Date(parsed.data.endAt),
      location: parsed.data.location,
      attendees: attendeeEmail ? [{ email: attendeeEmail, name: attendeeName ?? undefined }] : undefined,
      addMeetLink: !videoUrl, // ask Google for a Meet link only when vendor didn't paste one
    }).catch((e) => { logger.warn({ err: (e as Error).message }, 'calendar.google-push.failed'); return null; });
    if (pushed) {
      externalId = pushed.externalId;
      externalProvider = 'google';
      pushedToGoogle = true;
      if (pushed.hangoutLink && !videoUrl) videoUrl = pushed.hangoutLink;
    }
  }

  const event = await prisma.calendarEvent.create({
    data: {
      tenantId: auth.tenant.id,
      title: parsed.data.title,
      description: parsed.data.description,
      startAt: new Date(parsed.data.startAt),
      endAt: new Date(parsed.data.endAt),
      allDay: parsed.data.allDay ?? false,
      location: parsed.data.location,
      videoUrl,
      kind,
      hostUserId,
      projectId: parsed.data.projectId,
      contactId: parsed.data.contactId,
      leadId: parsed.data.leadId,
      meetingTypeId: parsed.data.meetingTypeId,
      type: parsed.data.kind === 'BLOCKED' ? 'BLOCKED' : 'INTERNAL',
      status: 'CONFIRMED',
      externalProvider,
      externalId,
    },
  });

  // If Google didn't deliver the invite (host not connected, or push failed),
  // fall back to our own ICS email so the attendee still gets a calendar invite.
  if (kind === 'MEETING' && attendeeEmail && !pushedToGoogle) {
    try {
      const icsText = buildIcs({
        uid: event.id + '@avantus',
        start: new Date(parsed.data.startAt),
        end: new Date(parsed.data.endAt),
        summary: parsed.data.title,
        description: parsed.data.description,
        location: parsed.data.location ?? videoUrl ?? undefined,
        organizerName: auth.user.fullName,
        organizerEmail: auth.user.email,
        attendeeName: attendeeName ?? undefined,
        attendeeEmail,
      });
      const dataUrl = `data:text/calendar;charset=utf-8;base64,${Buffer.from(icsText, 'utf8').toString('base64')}`;
      const when = new Date(parsed.data.startAt).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
      await sendEmail({
        to: attendeeEmail,
        subject: `Meeting invite: ${parsed.data.title} on ${new Date(parsed.data.startAt).toLocaleDateString('en-IN')}`,
        html: `<p>Hi ${attendeeName ?? 'there'},</p>
<p>${auth.user.fullName} (${auth.tenant.name}) has invited you to <strong>${parsed.data.title}</strong> on <strong>${when} IST</strong>.</p>
${videoUrl ? `<p>Join here: <a href="${videoUrl}">${videoUrl}</a></p>` : ''}
${parsed.data.location ? `<p>Where: ${parsed.data.location}</p>` : ''}
${parsed.data.description ? `<p>${parsed.data.description}</p>` : ''}
<p style="margin:24px 0"><a href="${dataUrl}" download="invite.ics" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Add to my calendar</a></p>`,
      });
    } catch (e) {
      logger.warn({ err: (e as Error).message }, 'calendar.invite-email.failed');
    }
  }

  return NextResponse.json({ event, invited: !!attendeeEmail }, { status: 201 });
}
