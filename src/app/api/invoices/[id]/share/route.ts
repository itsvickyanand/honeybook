/**
 * Mint (or return) a public View+Pay share link for an invoice.
 * Ensures the invoice has a number (SENT) before sharing.
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { markInvoiceSent } from '@/lib/invoice';

function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;

  let invoice = await prisma.invoice.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invoice.status === 'VOID') return NextResponse.json({ error: 'Invoice is void' }, { status: 400 });

  // Allocate a number so the shared document is a real invoice, not a draft.
  if (invoice.status === 'DRAFT') invoice = await markInvoiceSent(invoice.id);

  if (!invoice.shareToken) {
    const token = randomBytes(18).toString('base64url');
    invoice = await prisma.invoice.update({ where: { id: invoice.id }, data: { shareToken: token } });
  }

  return NextResponse.json({
    token: invoice.shareToken,
    url: `${appUrl()}/i/${invoice.shareToken}`,
  });
}
