import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { DocumentsClient } from './DocumentsClient';

const CATEGORY_COLOR: Record<string, string> = {
  CONTRACT: 'bg-purple-500/20 text-purple-300',
  VISA: 'bg-blue-500/20 text-blue-300',
  INVOICE_PDF: 'bg-emerald-500/20 text-emerald-300',
  RECEIPT: 'bg-emerald-500/20 text-emerald-300',
  OTHER: 'bg-slate-500/20 text-slate-300',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-500/20 text-slate-300',
  REQUESTED: 'bg-amber-500/20 text-amber-300',
  UPLOADED: 'bg-blue-500/20 text-blue-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  REJECTED: 'bg-red-500/20 text-red-300',
};

export default async function DocumentsPage() {
  const ctx = await requireContext();
  const docs = await prisma.document.findMany({
    where: { tenantId: ctx.tenant.id },
    include: { proposal: { select: { id: true, title: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Documents</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Contracts, visa documents, receipts. Templates are available out of the box for verticals like Travel.
            </p>
          </div>
          <DocumentsClient />
        </div>

        {docs.length === 0 ? (
          <div className="card p-12 text-center">
            <FileText className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No documents yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Add a contract, receipt, or template here.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-[var(--color-surface-2)] text-left text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Proposal</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t hover:bg-[var(--color-surface-2)]/50 transition">
                    <td className="px-4 py-3 font-medium">{d.title}</td>
                    <td className="px-4 py-3">
                      <span className={`chip ${CATEGORY_COLOR[d.category] ?? ''}`}>{d.category.toLowerCase().replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`chip ${STATUS_COLOR[d.status] ?? ''}`}>{d.status.toLowerCase()}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">
                      {d.proposal ? (
                        <Link href={`/app/proposals/${d.proposal.id}`} className="hover:text-white">{d.proposal.title}</Link>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageTransition>
  );
}
