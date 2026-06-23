/**
 * Client-triggered finalize after embedded DocuSign signing.
 *
 * The portal iframe detects `event=signing_complete` from DocuSign and POSTs
 * here. We pull the signed combined PDF directly from DocuSign and run the
 * same store-and-file path the webhook uses, so the signed agreement lands as
 * a CONTRACT document on the project without requiring Connect to be set up
 * in the DocuSign admin console.
 *
 * Idempotent: storeSignedContract short-circuits if signedFileId already set.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { downloadSigned } from '@/lib/esign';
import { storeSignedContract } from '@/lib/esign/store';
import { logger } from '@/lib/logger';

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    // Look up the proposal by the public share token, then its most recent
    // signature request. We don't trust the client to pass IDs — the token is
    // the access proof.
    const proposal = await prisma.proposal.findUnique({
      where: { shareToken: token },
      select: { id: true, tenantId: true },
    });
    if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const sig = await prisma.signatureRequest.findFirst({
      where: { proposalId: proposal.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!sig) return NextResponse.json({ error: 'No signature request to finalize.' }, { status: 404 });

    // Already finalized? Tell the client so they can re-poll status confidently.
    if (sig.signedFileId) {
      // Also resolve the existing Document.id so the client can re-download.
      const existingDoc = await prisma.document.findFirst({
        where: { tenantId: sig.tenantId, fileId: sig.signedFileId },
        select: { id: true },
      });
      return NextResponse.json({
        ok: true,
        alreadyFinalized: true,
        signatureRequestId: sig.id,
        fileId: sig.signedFileId,
        documentId: existingDoc?.id ?? null,
      });
    }

    if (sig.provider === 'mock') {
      // Mock path is finalized via /api/mock-sign/confirm — leave alone here.
      return NextResponse.json({ ok: true, mock: true });
    }

    if (!sig.externalId) {
      return NextResponse.json({ error: 'Signature request has no provider ID yet.' }, { status: 400 });
    }
    const pdf = await downloadSigned(sig.provider, sig.externalId, sig.tenantId);
    if (!pdf) {
      logger.warn({ signatureRequestId: sig.id, provider: sig.provider }, 'sign.finalize.no-pdf');
      // The signing event fired but DocuSign hasn't surfaced the signed copy
      // yet. Mark SIGNED so the UI flips, and let the webhook / next finalize
      // call pick up the PDF.
      await prisma.signatureRequest.update({
        where: { id: sig.id },
        data: { status: 'SIGNED', signedAt: sig.signedAt ?? new Date() },
      });
      return NextResponse.json({ ok: true, pdfPending: true, signatureRequestId: sig.id });
    }

    const result = await storeSignedContract(sig.id, pdf, `agreement-${sig.id.slice(-8)}.pdf`);
    return NextResponse.json({
      ok: true,
      signatureRequestId: sig.id,
      fileId: result?.fileId,
      documentId: result?.documentId,
    });
  } catch (e) {
    logger.error({ err: (e as Error).message, token }, 'sign.finalize.failed');
    return NextResponse.json({ error: 'Could not finalize signature.' }, { status: 500 });
  }
}
