import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { InvoiceDetail } from './InvoiceDetail';

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const inv = await prisma.invoice.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: { payments: true, proposal: true },
  });
  if (!inv) notFound();
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <Link href="/app/invoices" className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to invoices
        </Link>
        <InvoiceDetail
          invoice={{
            id: inv.id,
            number: inv.number,
            type: inv.type,
            status: inv.status,
            issueDate: inv.issueDate.toISOString(),
            dueDate: inv.dueDate?.toISOString() ?? null,
            subtotal: inv.subtotal,
            cgst: inv.cgst,
            sgst: inv.sgst,
            igst: inv.igst,
            total: inv.total,
            amountPaid: inv.amountPaid,
            placeOfSupply: inv.placeOfSupply,
            irn: inv.irn,
            content: inv.contentJson as unknown as { lineItems?: Array<{ name: string; quantity: number; unit: string; unitPrice: number; amount: number }>; notes?: string },
          }}
          payments={inv.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            status: p.status,
            provider: p.provider,
            paidAt: p.paidAt?.toISOString() ?? null,
          }))}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
          proposalTitle={inv.proposal?.title ?? null}
        />
      </div>
    </PageTransition>
  );
}
