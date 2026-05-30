import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { FormEditor } from './FormEditor';

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const form = await prisma.leadForm.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!form) notFound();
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <Link href="/app/forms" className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to forms
        </Link>
        <FormEditor
          id={form.id}
          name={form.name}
          slug={form.slug}
          title={form.title}
          description={form.description}
          active={form.active}
          fields={form.fieldsJson as unknown as { name: string; label: string; type: string; required?: boolean; options?: string[] }[]}
          redirectUrl={form.redirectUrl}
        />
      </div>
    </PageTransition>
  );
}
