import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ChevronLeft, MapPin, Video, User as UserIcon, Folder, CalendarDays } from 'lucide-react';
import { EventActions } from './EventActions';

export const dynamic = 'force-dynamic';

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireContext();
  const { id } = await params;
  const event = await prisma.calendarEvent.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      hostUser: { select: { fullName: true, email: true } },
      meetingType: { select: { name: true, color: true } },
      contact: { select: { id: true, fullName: true, email: true } },
      project: { select: { id: true, name: true } },
    },
  });
  if (!event) notFound();

  const start = event.startAt;
  const end = event.endAt;
  const sameDay = start.toDateString() === end.toDateString();

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl p-6 md:p-10">
        <Link href="/app/calendar" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <ChevronLeft className="h-4 w-4" /> Back to calendar
        </Link>

        <div className="card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                {event.kind.toLowerCase().replace('_', ' ')}{event.meetingType ? ` · ${event.meetingType.name}` : ''}
              </div>
              <h1 className="mt-1 text-2xl font-semibold">{event.title}</h1>
            </div>
            <span className={`chip text-xs ${event.status === 'CANCELLED' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
              {event.status}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <Row icon={<CalendarDays className="h-4 w-4" />}>
              {start.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}
              {' → '}
              {sameDay
                ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : end.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </Row>
            {event.hostUser && (
              <Row icon={<UserIcon className="h-4 w-4" />}>Host: {event.hostUser.fullName}</Row>
            )}
            {event.contact && (
              <Row icon={<UserIcon className="h-4 w-4" />}>
                With: <Link href={`/app/clients/${event.contact.id}`} className="hover:underline">{event.contact.fullName}</Link>
                {event.contact.email && <span className="text-[var(--color-muted)]"> · {event.contact.email}</span>}
              </Row>
            )}
            {event.project && (
              <Row icon={<Folder className="h-4 w-4" />}>
                Project: <Link href={`/app/projects/${event.project.id}`} className="hover:underline">{event.project.name}</Link>
              </Row>
            )}
            {event.location && <Row icon={<MapPin className="h-4 w-4" />}>{event.location}</Row>}
            {event.videoUrl && (
              <Row icon={<Video className="h-4 w-4" />}>
                <a href={event.videoUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">{event.videoUrl}</a>
              </Row>
            )}
          </div>

          {event.description && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-[var(--color-muted)] mb-1">Notes</div>
              <p className="whitespace-pre-wrap text-sm">{event.description}</p>
            </div>
          )}

          <EventActions eventId={event.id} status={event.status} />
        </div>
      </div>
    </PageTransition>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-[var(--color-muted)]">{icon}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}
