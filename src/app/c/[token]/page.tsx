/**
 * Collaborator portal — a scoped magic-link view for an external collaborator.
 * Shows ONLY their assigned tasks and files shared with them. No financials,
 * no internal notes, no other participants' tasks.
 */
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatDate } from '@/lib/utils';
import { CollabTasks } from './CollabTasks';

export const dynamic = 'force-dynamic';

export default async function CollaboratorPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await prisma.projectMember.findFirst({
    where: { accessToken: token, kind: 'COLLABORATOR' },
    include: { project: { include: { tenant: { select: { name: true, brandColor: true } } } } },
  });
  if (!member || !member.project) notFound();
  const project = member.project;

  const [tasks, docs] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeMemberId: member.id },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      select: { id: true, title: true, description: true, status: true, dueDate: true },
    }),
    prisma.document.findMany({
      where: { projectId: project.id, sharedWithClient: true, fileId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, fileId: true },
    }),
  ]);

  return (
    <main className="relative min-h-screen overflow-hidden p-6">
      <div className="aurora" />
      <div className="relative z-10 mx-auto max-w-2xl space-y-6">
        <div className="card overflow-hidden p-0">
          <div className="h-24" style={{ background: `linear-gradient(135deg, ${project.tenant.brandColor}, ${project.tenant.brandColor}99)` }} />
          <div className="p-6">
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Collaborator workspace · {project.tenant.name}</div>
            <h1 className="mt-1 text-2xl font-semibold">{project.name}</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Hi {member.name ?? 'there'} — here are your tasks and shared files for this project.</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="mb-3 font-semibold">Your tasks</h2>
          <CollabTasks token={token} initial={tasks.map((t) => ({ id: t.id, title: t.title, description: t.description, status: t.status, dueDate: t.dueDate?.toISOString() ?? null }))} />
        </div>

        <div className="card p-6">
          <h2 className="mb-3 font-semibold">Shared files</h2>
          {docs.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No files shared with you yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                  <span>{d.title}</span>
                  <a href={`/api/c/${token}/file/${d.id}`} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] hover:underline">Open</a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-center text-xs text-[var(--color-muted)]">You only see what's shared with you. {project.tenant.name}</p>
      </div>
    </main>
  );
}
