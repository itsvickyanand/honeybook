import Link from 'next/link';
import { Briefcase, Plus, CalendarRange } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { ProjectsActions } from './ProjectsActions';
import { formatCurrency, formatDate } from '@/lib/utils';

const STATUS_COLOR: Record<string, string> = {
  PLANNING: 'bg-slate-500/20 text-slate-300',
  CONFIRMED: 'bg-blue-500/20 text-blue-300',
  IN_PROGRESS: 'bg-purple-500/20 text-purple-300',
  DONE: 'bg-emerald-500/20 text-emerald-300',
  CANCELLED: 'bg-red-500/20 text-red-300',
};

export default async function ProjectsPage() {
  const ctx = await requireContext();
  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenant.id },
    include: {
      contact: true,
      members: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Projects</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Multi-event engagements (Sangeet + Wedding + Reception) and sub-vendor coordination.
            </p>
          </div>
          <ProjectsActions />
        </div>

        {projects.length === 0 ? (
          <div className="card p-12 text-center">
            <Briefcase className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No projects yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Group related proposals (multi-event weddings, recurring engagements) into a single project.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map((p) => (
              <div key={p.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.name}</div>
                    {p.contact && <div className="text-sm text-[var(--color-muted)]">{p.contact.fullName}</div>}
                    {p.description && <p className="mt-2 text-sm text-[var(--color-muted)] line-clamp-2">{p.description}</p>}
                    <div className="mt-3 flex flex-wrap gap-2 items-center text-xs text-[var(--color-muted)]">
                      {p.startDate && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarRange className="h-3 w-3" />
                          {formatDate(p.startDate)}{p.endDate ? ` → ${formatDate(p.endDate)}` : ''}
                        </span>
                      )}
                      {p.members.length > 0 && (
                        <span className="chip">{p.members.length} sub-vendor{p.members.length === 1 ? '' : 's'}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`chip ${STATUS_COLOR[p.status] ?? ''}`}>{p.status.replace('_', ' ').toLowerCase()}</span>
                    <div className="mt-2 text-lg font-semibold">
                      {formatCurrency(p.totalValue, ctx.tenant.currency, ctx.tenant.locale)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
