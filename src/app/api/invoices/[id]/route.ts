import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { canTransition } from '@/lib/invoice';

async function owned(id: string, tenantId: string) {
  return prisma.invoice.findFirst({ where: { id, tenantId } });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const inv = await prisma.invoice.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { payments: true },
  });
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ invoice: inv });
}

const patchSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const inv = await owned(id, auth.tenant.id);
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.status) {
    // Paid states are DERIVED from payments — never set directly. This keeps
    // amountPaid (= sum of SUCCESS payments) the single source of truth and
    // prevents the "status PAID but Paid ₹0" mismatch. Record a payment instead.
    if (parsed.data.status === 'PAID' || parsed.data.status === 'PARTIALLY_PAID') {
      return NextResponse.json(
        { error: 'Record a payment to mark this invoice paid — paid amounts are derived from payments.' },
        { status: 400 }
      );
    }
    if (!canTransition(inv.status, parsed.data.status)) {
      return NextResponse.json({ error: `Cannot transition ${inv.status} → ${parsed.data.status}` }, { status: 400 });
    }
    if (parsed.data.status === 'SENT') {
      const { markInvoiceSent } = await import('@/lib/invoice');
      const updated = await markInvoiceSent(inv.id);
      return NextResponse.json({ invoice: updated });
    }
    const updated = await prisma.invoice.update({ where: { id }, data: { status: parsed.data.status } });
    return NextResponse.json({ invoice: updated });
  }

  return NextResponse.json({ invoice: inv });
}
