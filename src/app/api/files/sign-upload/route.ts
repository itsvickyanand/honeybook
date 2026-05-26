/**
 * Issues a presigned PUT URL for direct browser → storage uploads.
 * After upload completes the client POSTs to /api/files/confirm to record the FileObject.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { getStorage, generateStorageKey } from '@/lib/storage';

const schema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  prefix: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const key = generateStorageKey(auth.tenant.id, parsed.data.filename, parsed.data.prefix);
  const storage = getStorage();
  const presigned = await storage.presignPut(key, parsed.data.contentType);
  return NextResponse.json({ ...presigned, filename: parsed.data.filename });
}
