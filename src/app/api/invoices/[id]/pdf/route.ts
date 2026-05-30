/**
 * Download an invoice as PDF. Renders on-demand (and caches) if not yet built.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { ensureInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { getStorage } from '@/lib/storage';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const { storageKey, filename } = await ensureInvoicePdf(invoice.id);
    const buf = await getStorage().getObject(storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, max-age=60',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not render PDF: ${(e as Error).message}` }, { status: 500 });
  }
}
