/**
 * Public booking page — clients pick a slot, fill name/email, confirm.
 */
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { BookingClient } from './BookingClient';

export const dynamic = 'force-dynamic';

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await prisma.meetingType.findFirst({
    where: { slug, active: true, archived: false },
    include: { tenant: { select: { name: true, brandColor: true } }, hostUser: { select: { fullName: true } } },
  });
  if (!m) notFound();
  return (
    <main className="relative min-h-screen overflow-hidden p-6">
      <div className="aurora" />
      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="card overflow-hidden p-0">
          <div className="h-20" style={{ background: `linear-gradient(135deg, ${m.color}, ${m.tenant.brandColor})` }} />
          <div className="p-6">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Book with {m.tenant.name}</div>
            <h1 className="mt-1 text-2xl font-semibold">{m.name}</h1>
            <div className="mt-1 text-sm text-[var(--color-muted)]">{m.durationMins} min · {m.locationType.replace('_', ' ').toLowerCase()}{m.hostUser ? ` · with ${m.hostUser.fullName}` : ''}</div>
            {m.description && <p className="mt-3 text-sm">{m.description}</p>}
          </div>
        </div>
        <BookingClient slug={slug} color={m.color} />
      </div>
    </main>
  );
}
