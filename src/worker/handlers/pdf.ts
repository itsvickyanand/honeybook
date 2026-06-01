import { Job } from 'bullmq';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/db';
import { getStorage, generateStorageKey } from '../../lib/storage';
import { renderInvoiceHtml } from '../../lib/pdf/invoice-template';
import { renderProposalHtml } from '../../lib/pdf/proposal-template';
import { htmlToPdf } from '../../lib/pdf/render';

/**
 * Render HTML to a real PDF via Puppeteer and store it.
 */
async function pdfToFile(tenantId: string, html: string, filename: string) {
  const buf = await htmlToPdf(html);
  const storage = getStorage();
  const baseName = filename.replace(/\.[^.]+$/, '');
  const key = generateStorageKey(tenantId, `${baseName}.pdf`, 'pdf');
  await storage.putObject(key, buf, 'application/pdf');
  const file = await prisma.fileObject.create({
    data: {
      tenantId,
      storageKey: key,
      filename: `${baseName}.pdf`,
      mimeType: 'application/pdf',
      bytes: buf.byteLength,
      visibility: 'TENANT',
    },
  });
  return file;
}

export async function handlePdfRenderInvoice(job: Job): Promise<unknown> {
  const { invoiceId } = job.data as { invoiceId: string };
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: true, proposal: true },
  });
  if (!invoice) throw new Error('Invoice not found');
  const html = renderInvoiceHtml(invoice);
  const file = await pdfToFile(invoice.tenantId, html, `${invoice.number ?? invoice.id}.pdf`);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfFileId: file.id } });
  logger.info({ invoiceId, fileId: file.id }, 'pdf.invoice.rendered');
  return { fileId: file.id };
}

export async function handlePdfRenderProposal(job: Job): Promise<unknown> {
  const { proposalId } = job.data as { proposalId: string };
  const p = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { tenant: true },
  });
  if (!p) throw new Error('Proposal not found');
  const html = await renderProposalHtml(p);
  const file = await pdfToFile(p.tenantId, html, `${p.title}.pdf`);
  await prisma.document.create({
    data: {
      tenantId: p.tenantId,
      proposalId: p.id,
      category: 'OTHER',
      title: `${p.title} (PDF)`,
      fileId: file.id,
      status: 'UPLOADED',
    },
  });
  return { fileId: file.id };
}
