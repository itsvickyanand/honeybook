/**
 * Public: poll a shared invoice's status. Pulls latest truth from Razorpay
 * (so the paid state updates after the redirect even without a webhook).
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { syncInvoiceFromGateway } from '@/lib/payments/sync';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { shareToken: token },
    select: { id: true, status: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!['PAID', 'VOID', 'DRAFT'].includes(invoice.status)) {
    await syncInvoiceFromGateway(invoice.id).catch(() => {});
  }

  const fresh = await prisma.invoice.findUnique({
    where: { id: invoice.id },
    select: { status: true, total: true, amountPaid: true, number: true },
  });
  return NextResponse.json({ invoice: fresh });
}
