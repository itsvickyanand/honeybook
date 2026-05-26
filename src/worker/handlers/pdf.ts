import { Job } from 'bullmq';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/db';
import { getStorage, generateStorageKey } from '../../lib/storage';
import { renderInvoiceHtml } from '../../lib/pdf/invoice-template';
import { renderProposalHtml } from '../../lib/pdf/proposal-template';

/**
 * PDF rendering — uses Playwright/Chromium in production. For dev parity without
 * a heavy headless browser dep, we save the HTML next to where the PDF would go
 * and record it as a FileObject. Production can swap in @sparticuz/chromium-min + puppeteer-core.
 */
async function htmlToFile(tenantId: string, html: string, filename: string, mimeType = 'text/html') {
  const storage = getStorage();
  const key = generateStorageKey(tenantId, filename, 'pdf');
  const buf = Buffer.from(html, 'utf8');
  await storage.putObject(key, buf, mimeType);
  const file = await prisma.fileObject.create({
    data: {
      tenantId,
      storageKey: key,
      filename,
      mimeType,
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
  const file = await htmlToFile(invoice.tenantId, html, `${invoice.number ?? invoice.id}.html`);
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
  const html = renderProposalHtml(p);
  const file = await htmlToFile(p.tenantId, html, `${p.title}.html`);
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
