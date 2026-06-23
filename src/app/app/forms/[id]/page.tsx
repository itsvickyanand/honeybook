import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { FormEditor } from './FormEditor';
import { SubmissionsTab } from './SubmissionsTab';

export const dynamic = 'force-dynamic';

export default async function FormDetailPage(
  { params, searchParams }:
  { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> },
) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === 'submissions' ? 'submissions' : 'edit';
  const ctx = await requireContext();

  const [form, meetingTypes, dripSequences, submissions] = await Promise.all([
    prisma.leadForm.findFirst({ where: { id, tenantId: ctx.tenant.id } }),
    prisma.meetingType.findMany({
      where: { tenantId: ctx.tenant.id, active: true, archived: false },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dripSequence.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      select: { id: true, name: true, trigger: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.formSubmission.findMany({
      where: { tenantId: ctx.tenant.id, formId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);
  if (!form) notFound();

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <Link href="/app/forms" className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Link>

        <div className="mb-6 inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-sm">
          <Link
            href={`/app/forms/${form.id}`}
            className={`rounded-lg px-3 py-1.5 ${tab === 'edit' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
          >Edit</Link>
          <Link
            href={`/app/forms/${form.id}?tab=submissions`}
            className={`rounded-lg px-3 py-1.5 ${tab === 'submissions' ? 'bg-[var(--color-surface-2)] font-medium' : 'text-[var(--color-muted)]'}`}
          >Submissions {submissions.length > 0 && <span className="ml-1 text-[var(--color-muted)]">({submissions.length})</span>}</Link>
        </div>

        {tab === 'edit' ? (
          <FormEditor
            id={form.id}
            name={form.name}
            slug={form.slug}
            title={form.title}
            description={form.description}
            active={form.active}
            fields={form.fieldsJson as unknown as { name: string; label: string; type: string; required?: boolean; options?: string[] }[]}
            redirectUrl={form.redirectUrl}
            actions={(form.actionsJson as unknown as { type: string; props?: Record<string, unknown> }[] | null) ?? []}
            category={form.category as 'LEAD' | 'CONTACT'}
            meetingTypes={meetingTypes}
            dripSequences={dripSequences}
          />
        ) : (
          <SubmissionsTab
            submissions={submissions.map((s) => ({
              id: s.id,
              createdAt: s.createdAt.toISOString(),
              payloadJson: (s.payloadJson as unknown) as Record<string, string>,
              contactId: s.contactId,
              leadId: s.leadId,
              proposalId: s.proposalId,
              actionResultsJson: (s.actionResultsJson as unknown) as { type: string; ok: boolean; error?: string; durationMs: number }[] | null,
            }))}
          />
        )}
      </div>
    </PageTransition>
  );
}
