/**
 * Create a credit note against an existing invoice.
 * The credit note is itself an Invoice of type CREDIT_NOTE, linked back via voidOfId,
 * with its own number once SENT.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { currentFinancialYear } from '@/lib/financial-year';
import { markInvoiceSent } from '@/lib/invoice';

const schema = z.object({
  amount: z.number().positive(),
  reason: z.string().min(1).max(500),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const original = await prisma.invoice.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (original.type === 'CREDIT_NOTE') return NextResponse.json({ error: 'Cannot issue credit note against a credit note' }, { status: 400 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const note = await prisma.invoice.create({
    data: {
      tenantId: auth.tenant.id,
      proposalId: original.proposalId,
      contactId: original.contactId,
      type: 'CREDIT_NOTE',
      series: 'CN',
      financialYear: currentFinancialYear(),
      placeOfSupply: original.placeOfSupply,
      voidOfId: original.id,
      contentJson: {
        reason: parsed.data.reason,
        originalInvoiceId: original.id,
        originalNumber: original.number,
        lineItems: [{
          name: `Credit note against ${original.number ?? 'invoice'}`,
          quantity: 1,
          unit: 'note',
          unitPrice: parsed.data.amount,
          amount: parsed.data.amount,
        }],
      } as object,
      subtotal: parsed.data.amount,
      total: parsed.data.amount,
      status: 'DRAFT',
    },
  });
  // Immediately allocate a CN/<FY>/NNNNN number
  const sent = await markInvoiceSent(note.id);
  return NextResponse.json({ invoice: sent });
}
