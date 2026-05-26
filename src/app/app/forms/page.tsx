import Link from 'next/link';
import { Inbox, Plus, Copy, ExternalLink } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { FormsActions } from './FormsActions';

export default async function FormsPage() {
  const ctx = await requireContext();
  const forms = await prisma.leadForm.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Lead forms</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Public forms you embed on your website. Submissions become Leads.
            </p>
          </div>
          <FormsActions />
        </div>

        {forms.length === 0 ? (
          <div className="card p-12 text-center">
            <Inbox className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No forms yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Create one and we&apos;ll give you a public URL + embed code.
            </p>
            <div className="mt-4">
              <FormsActions />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {forms.map((f) => (
              <Link key={f.id} href={`/app/forms/${f.id}`} className="card p-5 hover:border-[var(--color-primary)]/60 transition">
                <div className="font-semibold">{f.name}</div>
                <div className="mt-1 text-xs text-[var(--color-muted)]">{(f.fieldsJson as unknown as unknown[]).length} fields</div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="chip">/{f.slug}</span>
                  <span className={`chip ${f.active ? 'bg-emerald-500/20 text-emerald-300' : ''}`}>{f.active ? 'Active' : 'Paused'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
