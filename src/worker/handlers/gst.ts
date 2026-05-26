import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { generateIrnForInvoice } from '../../lib/gst';
import { logger } from '../../lib/logger';

export async function handleGstIrnGenerate(job: Job): Promise<unknown> {
  const { invoiceId } = job.data as { invoiceId: string };
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: true },
  });
  if (!invoice) return { skipped: 'not-found' };

  // Below-threshold tenants skip IRN
  if (invoice.tenant.gstinTurnover < 50000000) {
    logger.info({ invoiceId }, 'gst.irn.skipped-below-threshold');
    return { skipped: 'below-threshold' };
  }

  const { irn, qrCode } = await generateIrnForInvoice(invoice);
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { irn, irnQrCode: qrCode },
  });
  return { irn };
}
