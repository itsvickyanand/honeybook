/**
 * Persist a signed contract: store the PDF, file it into the project as a shared
 * CONTRACT document, and stamp the SignatureRequest with signedFileId + SIGNED.
 *
 * Used by the Digio/DocuSign webhooks (real signed PDF) and the mock-sign flow
 * (a generated stamped PDF), so the "signed contract is saved" guarantee holds
 * regardless of provider.
 */
import { prisma } from '../db';
import { logger } from '../logger';
import { getStorage, generateStorageKey } from '../storage';

export async function storeSignedContract(
  signatureRequestId: string,
  pdf: Buffer,
  filename: string
): Promise<{ fileId: string; documentId: string | null } | null> {
  const sig = await prisma.signatureRequest.findUnique({ where: { id: signatureRequestId } });
  if (!sig) return null;
  if (sig.signedFileId) {
    // Idempotent — find the document row created on the previous run so the
    // caller can still trigger a download.
    const existingDoc = await prisma.document.findFirst({
      where: { tenantId: sig.tenantId, fileId: sig.signedFileId },
      select: { id: true },
    });
    return { fileId: sig.signedFileId, documentId: existingDoc?.id ?? null };
  }

  // Resolve the project this contract belongs to (via the proposal).
  let projectId: string | null = null;
  if (sig.proposalId) {
    const p = await prisma.proposal.findUnique({ where: { id: sig.proposalId }, select: { projectId: true } });
    projectId = p?.projectId ?? null;
  }

  const storage = getStorage();
  const safe = filename.replace(/[^\w.-]+/g, '-');
  const key = generateStorageKey(sig.tenantId, safe.endsWith('.pdf') ? safe : `${safe}.pdf`, 'contracts');
  await storage.putObject(key, pdf, 'application/pdf');

  const file = await prisma.fileObject.create({
    data: {
      tenantId: sig.tenantId,
      storageKey: key,
      filename: safe.endsWith('.pdf') ? safe : `${safe}.pdf`,
      mimeType: 'application/pdf',
      bytes: pdf.byteLength,
      visibility: 'TENANT',
    },
  });

  await prisma.signatureRequest.update({
    where: { id: sig.id },
    data: { signedFileId: file.id, status: 'SIGNED', signedAt: sig.signedAt ?? new Date() },
  });

  // File it into the project (shared with client so they can download it too).
  const document = await prisma.document.create({
    data: {
      tenantId: sig.tenantId,
      projectId: projectId ?? undefined,
      proposalId: sig.proposalId ?? undefined,
      category: 'CONTRACT',
      title: 'Signed agreement',
      fileId: file.id,
      status: 'APPROVED',
      sharedWithClient: true,
    },
  }).catch((e) => {
    logger.warn({ err: (e as Error).message }, 'signed-contract.document.failed');
    return null;
  });

  logger.info({ signatureRequestId, fileId: file.id, documentId: document?.id, projectId }, 'signed-contract.stored');
  return { fileId: file.id, documentId: document?.id ?? null };
}
