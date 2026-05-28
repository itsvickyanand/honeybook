/**
 * Client-side project portal — shown to the client after a proposal has been
 * paid against (Project auto-created). Resolved by the *proposal* shareToken
 * so the client uses the same link they got pre-booking.
 *
 * What the client sees:
 *   - Booking summary (title, dates, total + balance)
 *   - Payment schedule with status
 *   - Public-safe tasks (DELIVERY category only — internal prep tasks stay hidden)
 *   - Files marked as deliverables
 *   - A "send a message" form (creates Message in the ChatThread)
 *
 * NOT shown: internal team, financial details beyond what the client paid,
 * audit log, lead pipeline.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/utils';

const formatINR = (n: number) => formatCurrency(n, 'INR', 'en-IN');

export const dynamic = 'force-dynamic';

export default async function ClientProjectPortal({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const proposal = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: {
      tenant: { select: { name: true, brandColor: true, logoUrl: true, contactEmail: true, contactPhone: true, websiteUrl: true } },
      project: {
        include: {
          tasks: {
            where: { category: 'DELIVERY', status: { not: 'CANCELLED' } },
            orderBy: { sortOrder: 'asc' },
          },
          paymentSchedules: {
            include: { items: { orderBy: { dueDate: 'asc' } } },
          },
          invoices: {
            select: { id: true, number: true, total: true, amountPaid: true, status: true, dueDate: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      },
    },
  });

  if (!proposal || !proposal.project) notFound();
  const project = proposal.project;
  const totalPaid = project.invoices.reduce((s, i) => s + i.amountPaid, 0);
  const balance = Math.max(0, project.totalValue - totalPaid);
  const schedule = project.paymentSchedules[0];

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      {/* Branded header */}
      <header className="border-b bg-white" style={{ borderColor: 'rgb(0 0 0 / .05)' }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          {proposal.tenant.logoUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={proposal.tenant.logoUrl} alt="" className="h-9 w-9 rounded object-contain" />
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">{proposal.tenant.name}</div>
            <h1 className="text-base font-semibold">{project.name}</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        {/* Status hero */}
        <section
          className="overflow-hidden rounded-2xl text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${proposal.tenant.brandColor}, ${proposal.tenant.brandColor}cc)` }}
        >
          <div className="p-6">
            <div className="text-xs uppercase tracking-wider opacity-80">Your project</div>
            <div className="mt-1 text-2xl font-semibold">Booking confirmed 🎉</div>
            <p className="mt-1 text-sm opacity-90">
              Thanks for paying! We've reserved your date and started prep. You can track everything below.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-xs opacity-80">Total</div>
                <div className="font-semibold tabular-nums">{formatINR(project.totalValue)}</div>
              </div>
              <div>
                <div className="text-xs opacity-80">Paid</div>
                <div className="font-semibold tabular-nums">{formatINR(totalPaid)}</div>
              </div>
              <div>
                <div className="text-xs opacity-80">Balance</div>
                <div className="font-semibold tabular-nums">{formatINR(balance)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Payment schedule */}
        {schedule && schedule.items.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Payment plan</h2>
            <ul className="mt-3 space-y-2">
              {schedule.items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{it.label}</div>
                    <div className="text-xs text-slate-500">
                      Due {it.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{formatINR(it.amount)}</div>
                    <div
                      className={`text-xs font-medium ${
                        it.status === 'PAID'
                          ? 'text-emerald-700'
                          : it.status === 'INVOICED'
                          ? 'text-amber-700'
                          : 'text-slate-500'
                      }`}
                    >
                      {it.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Deliverables (client-visible tasks) */}
        {project.tasks.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">What to expect</h2>
            <p className="mt-1 text-xs text-slate-500">
              The deliverables your vendor is preparing.
            </p>
            <ul className="mt-4 space-y-2">
              {project.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 text-sm">
                  <span
                    className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                      t.status === 'DONE'
                        ? 'bg-emerald-500 text-white'
                        : 'border-2 border-slate-300 bg-white'
                    }`}
                  >
                    {t.status === 'DONE' && <span className="text-[10px]">✓</span>}
                  </span>
                  <div className="flex-1">
                    <div className={t.status === 'DONE' ? 'line-through text-slate-500' : ''}>
                      {t.title}
                    </div>
                    {t.dueDate && (
                      <div className="text-xs text-slate-500">
                        By {t.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Invoices */}
        {project.invoices.length > 0 && (
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-semibold">Invoices</h2>
            <ul className="mt-3 space-y-2">
              {project.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{inv.number ?? 'Pending number'}</div>
                    <div className="text-xs text-slate-500">
                      {inv.status} · Due {inv.dueDate ? inv.dueDate.toLocaleDateString('en-IN') : '—'}
                    </div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div>{formatINR(inv.total)}</div>
                    {inv.amountPaid > 0 && (
                      <div className="text-xs text-emerald-700">Paid {formatINR(inv.amountPaid)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer / Contact */}
        <footer className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
          <h3 className="font-semibold">Questions?</h3>
          <p className="mt-1 text-slate-600">
            Reach out to {proposal.tenant.name}:
          </p>
          <ul className="mt-2 space-y-1 text-slate-600">
            {proposal.tenant.contactEmail && (
              <li>
                Email:{' '}
                <a href={`mailto:${proposal.tenant.contactEmail}`} className="font-medium text-slate-900 hover:underline">
                  {proposal.tenant.contactEmail}
                </a>
              </li>
            )}
            {proposal.tenant.contactPhone && (
              <li>
                Phone:{' '}
                <a href={`tel:${proposal.tenant.contactPhone}`} className="font-medium text-slate-900 hover:underline">
                  {proposal.tenant.contactPhone}
                </a>
              </li>
            )}
            {proposal.tenant.websiteUrl && (
              <li>
                Web:{' '}
                <a href={proposal.tenant.websiteUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:underline">
                  {proposal.tenant.websiteUrl}
                </a>
              </li>
            )}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            <Link href={`/p/${token}`} className="hover:underline">
              ← Back to the original proposal
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
