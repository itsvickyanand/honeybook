/**
 * Public: download the signed agreement PDF for a proposal's share token.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const proposal = await prisma.proposal.findUnique({ where: { shareToken: token }, select: { id: true } });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sig = await prisma.signatureRequest.findFirst({
    where: { proposalId: proposal.id, status: 'SIGNED', signedFileId: { not: null } },
    orderBy: { signedAt: 'desc' },
    select: { signedFileId: true },
  });
  if (!sig?.signedFileId) return NextResponse.json({ error: 'No signed agreement yet' }, { status: 404 });

  const file = await prisma.fileObject.findUnique({ where: { id: sig.signedFileId }, select: { storageKey: true, filename: true, mimeType: true } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const buf = await getStorage().getObject(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': file.mimeType || 'application/pdf',
        'content-disposition': `inline; filename="${file.filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not read file' }, { status: 500 });
  }
}
