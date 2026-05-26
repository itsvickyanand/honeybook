import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({ requestId: z.string() });

export async function POST(req: Request) {
  if (process.env.DIGIO_CLIENT_ID) {
    return NextResponse.json({ error: 'Mock sign disabled — Digio is configured' }, { status: 400 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const sig = await prisma.signatureRequest.findUnique({ where: { id: parsed.data.requestId } });
  if (!sig) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (sig.status === 'SIGNED') return NextResponse.json({ ok: true, already: true });
  await prisma.signatureRequest.update({
    where: { id: sig.id },
    data: { status: 'SIGNED', signedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
