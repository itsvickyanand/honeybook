/**
 * Project file attachments. Registers an uploaded object as a FileObject and a
 * Document tied to the project (shows in the Files tab). PATCH toggles
 * sharedWithClient (controls collaborator/client visibility).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

async function ensureProject(tenantId: string, id: string) {
  return prisma.project.findFirst({ where: { id, tenantId }, select: { id: true } });
}

const postSchema = z.object({
  storageKey: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative().default(0),
  sharedWithClient: z.boolean().optional().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('project.manage');
  if ('error' in auth) return auth.error;
  if (!(await ensureProject(auth.tenant.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const file = await prisma.fileObject.create({
    data: {
      tenantId: auth.tenant.id,
      storageKey: parsed.data.storageKey,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.bytes,
      uploadedById: auth.user.id,
      visibility: 'TENANT',
    },
  });
  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenant.id,
      projectId: id,
      category: 'OTHER',
      title: parsed.data.filename,
      fileId: file.id,
      status: 'UPLOADED',
      sharedWithClient: parsed.data.sharedWithClient,
    },
  });
  return NextResponse.json({ document: doc }, { status: 201 });
}

const patchSchema = z.object({ documentId: z.string(), sharedWithClient: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('project.manage');
  if ('error' in auth) return auth.error;
  if (!(await ensureProject(auth.tenant.id, id))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  await prisma.document.updateMany({
    where: { id: parsed.data.documentId, tenantId: auth.tenant.id, projectId: id },
    data: { sharedWithClient: parsed.data.sharedWithClient },
  });
  return NextResponse.json({ ok: true });
}
