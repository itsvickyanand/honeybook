/**
 * Public document download for the client portal.
 *
 * GET /api/share/[token]/documents/[documentId]
 *   → { url, filename } where url is a short-lived presigned R2 GET.
 *
 * Authorization model: the share token is the access proof. The document must
 * either be (a) directly linked to the proposal that owns this token, or
 * (b) linked to the same project as that proposal AND marked sharedWithClient.
 * Anything else 404s — we never leak documents the vendor didn't intend to
 * share.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { logger } from '@/lib/logger';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await params;
  try {
    const proposal = await prisma.proposal.findUnique({
      where: { shareToken: token },
      select: { id: true, tenantId: true, projectId: true },
    });
    if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        tenantId: proposal.tenantId,
        OR: [
          { proposalId: proposal.id },
          ...(proposal.projectId
            ? [{ projectId: proposal.projectId, sharedWithClient: true }]
            : []),
        ],
      },
    });
    if (!doc || !doc.fileId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const file = await prisma.fileObject.findUnique({
      where: { id: doc.fileId },
      select: { storageKey: true, filename: true, mimeType: true },
    });
    if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const url = await getStorage().publicUrl(file.storageKey);
    return NextResponse.json({
      url,
      filename: file.filename,
      mimeType: file.mimeType,
      title: doc.title,
    });
  } catch (e) {
    logger.error({ err: (e as Error).message, token, documentId }, 'share.document.download.failed');
    return NextResponse.json({ error: 'Could not fetch document.' }, { status: 500 });
  }
}
