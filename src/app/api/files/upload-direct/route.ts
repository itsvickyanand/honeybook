/**
 * Local-driver direct upload endpoint.
 * Only used when STORAGE_DRIVER=local — otherwise the browser PUTs to S3 directly.
 */
import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'missing key' }, { status: 400 });
  const contentType = req.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await req.arrayBuffer());
  await getStorage().putObject(key, buf, contentType);
  return NextResponse.json({ ok: true });
}
