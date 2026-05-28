/**
 * Project workspace — the HoneyBook-style detail page.
 *
 * Layout: cover banner → action bar → tabbed content (Activity / Files / Tasks
 * / Financials / Notes / Details) on the left, "About this project" meta
 * sidebar on the right. Tabs are URL-driven (?tab=).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession, getCurrentContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { Card, CardHeader } from '@/components/ui/Card';
import TaskList, { TaskItem } from '@/components/tasks/TaskList';
import { StageSelect, ProjectActivity, ProjectNotes, TagEditor } from './WorkspaceClient';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Activity as ActivityIcon, FileText, CheckCircle2, Receipt, StickyNote, Info,
  Users, ExternalLink, CalendarDays,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
const formatINR = (n: number, c = 'INR', l = 'en-IN') => formatCurrency(n, c, l);

const TABS = [
  { id: 'activity', label: 'Activity', icon: ActivityIcon },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle2 },
  { id: 'financials', label: 'Financials', icon: Receipt },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'details', label: 'Details', icon: Info },
] as const;

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireSession();
  const ctx = await getCurrentContext();
  if (!ctx) return null;
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.id === sp.tab)?.id ?? 'activity');

  const project = await prisma.project.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      contact: true,
      lead: { include: { stage: true } },
      tasks: { orderBy: [{ sortOrder: 'asc' }, { dueDate: 'asc' }] },
      invoices: { orderBy: { createdAt: 'desc' }, include: { payments: true } },
      proposals: { orderBy: { createdAt: 'desc' } },
      paymentSchedules: { include: { items: { orderBy: { dueDate: 'asc' } } } },
    },
  });
  if (!project) notFound();

  const cur = ctx.tenant.currency;
  const loc = ctx.tenant.locale;
  const totalPaid = project.invoices.reduce((s, i) => s + i.amountPaid, 0);
  const balance = Math.max(0, project.totalValue - totalPaid);
  const openTasks = project.tasks.filter((t) => t.status !== 'DONE' && t.status !== 'CANCELLED');
  const tags = Array.isArray(project.tags) ? (project.tags as string[]) : [];
  const shareToken = project.proposals[0]?.shareToken;

  // Activity feed (project + contact + lead scoped)
  const activities = await prisma.activity.findMany({
    where: {
      tenantId: ctx.tenant.id,
      OR: [
        { projectId: id },
        project.contactId ? { contactId: project.contactId } : undefined,
        project.leadId ? { leadId: project.leadId } : undefined,
      ].filter(Boolean) as object[],
    },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Cover banner */}
      <div
        className="relative h-44 w-full overflow-hidden rounded-2xl"
        style={{
          background: project.coverImageUrl
            ? `url(${project.coverImageUrl}) center/cover`
            : `linear-gradient(135deg, ${ctx.tenant.brandColor}, ${ctx.tenant.brandColor}99)`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-5 right-5 text-white">
          <Link href="/app/projects" className="text-xs opacity-80 hover:underline">← Projects</Link>
          <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm opacity-90">
            {project.startDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(project.startDate)}
              </span>
            )}
            {project.contact && <span>· {project.contact.fullName}</span>}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Users className="h-4 w-4" />
          <span>{1 + (project.contact ? 1 : 0)} participant{project.contact ? 's' : ''}</span>
          {project.contact?.email && <span>· {project.contact.email}</span>}
        </div>
        {shareToken && (
          <Link
            href={`/p/${shareToken}/project`}
            target="_blank"
            className="btn-secondary text-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Client portal
          </Link>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div>
          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)]">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = t.id === tab;
              return (
                <Link
                  key={t.id}
                  href={`/app/projects/${id}?tab=${t.id}`}
                  className={`flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2 text-sm transition ${
                    active
                      ? 'border-[var(--color-primary)] text-[var(--color-text)]'
                      : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.id === 'tasks' && openTasks.length > 0 && (
                    <span className="chip text-[10px]">{openTasks.length}</span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="mt-5">
            {tab === 'activity' && (
              <ProjectActivity
                projectId={id}
                clientEmail={project.contact?.email ?? null}
                initial={activities.map((a) => ({
                  id: a.id,
                  type: a.type,
                  title: a.title,
                  body: a.body,
                  createdAt: a.createdAt.toISOString(),
                  user: a.user,
                }))}
              />
            )}

            {tab === 'files' && (
              <Card>
                <CardHeader title="Files" description="Proposals, invoices, galleries and documents for this workspace." />
                <div className="space-y-2 text-sm">
                  {project.proposals.map((p) => (
                    <Link key={p.id} href={`/app/proposals/${p.id}`} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-primary)]/60">
                      <span>Proposal · {p.title}</span><span className="chip text-xs">{p.status}</span>
                    </Link>
                  ))}
                  {project.invoices.map((i) => (
                    <Link key={i.id} href={`/app/invoices/${i.id}`} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 hover:border-[var(--color-primary)]/60">
                      <span>Invoice · {i.number ?? 'Draft'}</span><span className="chip text-xs">{i.status}</span>
                    </Link>
                  ))}
                  {project.proposals.length === 0 && project.invoices.length === 0 && (
                    <p className="text-[var(--color-muted)]">No files yet.</p>
                  )}
                </div>
              </Card>
            )}

            {tab === 'tasks' && (
              <Card>
                <CardHeader title="Tasks" description="Auto-seeded from the template. Add, assign, reorder." />
                <TaskList
                  projectId={id}
                  grouped
                  showProject={false}
                  initialTasks={project.tasks.map((t): TaskItem => ({
                    id: t.id, title: t.title, description: t.description,
                    status: t.status as TaskItem['status'], category: t.category,
                    priority: t.priority as TaskItem['priority'],
                    dueDate: t.dueDate?.toISOString() ?? null,
                    assigneeId: t.assigneeId, sortOrder: t.sortOrder, projectId: id,
                  }))}
                />
              </Card>
            )}

            {tab === 'financials' && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Quoted" value={formatINR(project.totalValue, cur, loc)} />
                  <Stat label="Paid" value={formatINR(totalPaid, cur, loc)} accent="emerald" />
                  <Stat label="Balance" value={formatINR(balance, cur, loc)} accent={balance > 0 ? 'amber' : undefined} />
                </div>
                {project.paymentSchedules[0] && (
                  <Card>
                    <CardHeader title="Payment plan" />
                    <ul className="space-y-2">
                      {project.paymentSchedules[0].items.map((it) => (
                        <li key={it.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                          <div><div className="font-medium">{it.label}</div><div className="text-xs text-[var(--color-muted)]">Due {formatDate(it.dueDate)}</div></div>
                          <div className="text-right"><div className="tabular-nums">{formatINR(it.amount, cur, loc)}</div><div className="text-xs text-[var(--color-muted)]">{it.status}</div></div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                <Card>
                  <CardHeader title="Invoices" />
                  {project.invoices.length === 0 ? (
                    <p className="text-sm text-[var(--color-muted)]">No invoices.</p>
                  ) : (
                    <ul className="space-y-2">
                      {project.invoices.map((inv) => (
                        <li key={inv.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                          <Link href={`/app/invoices/${inv.id}`} className="hover:underline">{inv.number ?? 'Draft'}</Link>
                          <div className="text-right tabular-nums">
                            <div>{formatINR(inv.total, cur, loc)}</div>
                            {inv.amountPaid > 0 && <div className="text-xs text-emerald-500">Paid {formatINR(inv.amountPaid, cur, loc)}</div>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}

            {tab === 'notes' && <ProjectNotes projectId={id} initial={project.notesText ?? ''} />}

            {tab === 'details' && (
              <Card>
                <CardHeader title="Details" />
                <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
                  <dt className="text-[var(--color-muted)]">Client</dt>
                  <dd>{project.contact?.fullName ?? '—'}</dd>
                  <dt className="text-[var(--color-muted)]">Email</dt>
                  <dd>{project.contact?.email ?? '—'}</dd>
                  <dt className="text-[var(--color-muted)]">Event date</dt>
                  <dd>{project.startDate ? formatDate(project.startDate) : '—'}</dd>
                  <dt className="text-[var(--color-muted)]">Lead source</dt>
                  <dd>{project.leadSource ?? '—'}</dd>
                  <dt className="text-[var(--color-muted)]">Template</dt>
                  <dd>{project.templateSlug ?? '—'}</dd>
                  <dt className="text-[var(--color-muted)]">Description</dt>
                  <dd className="whitespace-pre-wrap">{project.description ?? '—'}</dd>
                </dl>
              </Card>
            )}
          </div>
        </div>

        {/* Meta sidebar */}
        <aside className="space-y-4">
          <Card>
            <CardHeader title="About this project" />
            <div className="space-y-4 text-sm">
              <div>
                <label className="label-base">Stage</label>
                <StageSelect projectId={id} value={project.stage} />
              </div>
              <div>
                <label className="label-base">Tags</label>
                <TagEditor projectId={id} initial={tags} />
              </div>
              <div>
                <label className="label-base">Lead source</label>
                <div className="text-[var(--color-muted)]">{project.leadSource ?? '—'}</div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming tasks" />
            {openTasks.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">All caught up.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {openTasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2">
                    <span className="line-clamp-1">{t.title}</span>
                    {t.dueDate && <span className="shrink-0 text-xs text-[var(--color-muted)]">{formatDate(t.dueDate)}</span>}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/app/projects/${id}?tab=tasks`} className="mt-3 inline-block text-xs text-[var(--color-primary)] hover:underline">
              View all →
            </Link>
          </Card>

          {project.lead && (
            <Card>
              <CardHeader title="From lead" />
              <Link href="/app/leads" className="text-sm hover:underline">{project.lead.title}</Link>
              <div className="mt-1 text-xs text-[var(--color-muted)]">Stage: {project.lead.stage.name}</div>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'amber' }) {
  const color = accent === 'emerald' ? 'text-emerald-500' : accent === 'amber' ? 'text-amber-500' : '';
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
