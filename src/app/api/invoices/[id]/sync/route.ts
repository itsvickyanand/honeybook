/**
 * Vendor-side: force a pull of payment status from Razorpay for this invoice.
 * Useful when a client paid but the webhook didn't land — flips any captured
 * PENDING payment to SUCCESS and reconciles (updates amountPaid + fan-out).
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { syncInvoiceFromGateway } from '@/lib/payments/sync';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await syncInvoiceFromGateway(invoice.id);
  const fresh = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    select: { status: true, amountPaid: true, total: true },
  });
  return NextResponse.json({ ...result, invoice: fresh });
}
