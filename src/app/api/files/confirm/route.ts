/**
 * Records the uploaded file in the database after the browser has PUT it to storage.
 * Optionally extracts image dimensions via Sharp.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getStorage } from '@/lib/storage';

const schema = z.object({
  storageKey: z.string().min(1),
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  bytes: z.number().int().positive(),
  visibility: z.enum(['PRIVATE', 'TENANT', 'PUBLIC']).optional(),
  galleryId: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // Image dimensions extraction (best-effort)
  let width: number | undefined;
  let height: number | undefined;
  if (parsed.data.mimeType.startsWith('image/')) {
    try {
      const buf = await getStorage().getObject(parsed.data.storageKey);
      const meta = await sharp(buf).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      /* tolerate failures — file is already uploaded */
    }
  }

  const file = await prisma.fileObject.create({
    data: {
      tenantId: auth.tenant.id,
      storageKey: parsed.data.storageKey,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.bytes,
      width,
      height,
      uploadedById: auth.user.id,
      visibility: parsed.data.visibility ?? 'TENANT',
    },
  });

  if (parsed.data.galleryId) {
    const gallery = await prisma.gallery.findFirst({
      where: { id: parsed.data.galleryId, tenantId: auth.tenant.id },
    });
    if (gallery) {
      await prisma.galleryItem.create({
        data: { galleryId: gallery.id, fileId: file.id },
      });
    }
  }

  const publicUrl = await getStorage().publicUrl(parsed.data.storageKey);
  return NextResponse.json({ file: { ...file, url: publicUrl } });
}
