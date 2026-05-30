/**
 * Ensure an invoice has a rendered PDF, rendering on-demand if missing.
 *
 * The worker also renders invoice PDFs (handlePdfRenderInvoice), but PDF render
 * is a SKIPPABLE job — on Vercel with no worker it never runs. This helper lets
 * the download/email routes render synchronously the first time, store the file,
 * cache `pdfFileId`, and return the FileObject. Idempotent: returns the cached
 * file on subsequent calls.
 */
import { prisma } from '../db';
import { getStorage, generateStorageKey } from '../storage';
import { renderInvoiceHtml } from './invoice-template';
import { htmlToPdf } from './render';

export async function ensureInvoicePdf(invoiceId: string): Promise<{ fileId: string; storageKey: string; filename: string }> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { tenant: true, proposal: true },
  });
  if (!invoice) throw new Error('Invoice not found');

  // Cached?
  if (invoice.pdfFileId) {
    const file = await prisma.fileObject.findUnique({ where: { id: invoice.pdfFileId } });
    if (file) return { fileId: file.id, storageKey: file.storageKey, filename: file.filename };
  }

  const html = renderInvoiceHtml(invoice);
  const buf = await htmlToPdf(html);
  const storage = getStorage();
  const baseName = (invoice.number ?? invoice.id).replace(/[^\w.-]+/g, '-');
  const key = generateStorageKey(invoice.tenantId, `${baseName}.pdf`, 'pdf');
  await storage.putObject(key, buf, 'application/pdf');
  const file = await prisma.fileObject.create({
    data: {
      tenantId: invoice.tenantId,
      storageKey: key,
      filename: `${baseName}.pdf`,
      mimeType: 'application/pdf',
      bytes: buf.byteLength,
      visibility: 'TENANT',
    },
  });
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfFileId: file.id } });
  return { fileId: file.id, storageKey: key, filename: file.filename };
}
