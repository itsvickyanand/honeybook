/**
 * Collaborator portal: stream a file shared with them. Scoped to documents on
 * their project that are sharedWithClient.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;
  const member = await prisma.projectMember.findFirst({ where: { accessToken: token, kind: 'COLLABORATOR' }, select: { projectId: true } });
  if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const doc = await prisma.document.findFirst({
    where: { id: docId, projectId: member.projectId, sharedWithClient: true },
    select: { fileId: true, title: true },
  });
  if (!doc?.fileId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const file = await prisma.fileObject.findUnique({ where: { id: doc.fileId }, select: { storageKey: true, filename: true, mimeType: true } });
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const buf = await getStorage().getObject(file.storageKey);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'content-type': file.mimeType || 'application/octet-stream',
        'content-disposition': `inline; filename="${file.filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not read file' }, { status: 500 });
  }
}
