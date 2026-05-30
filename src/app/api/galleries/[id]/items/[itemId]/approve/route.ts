/**
 * Public-portal action: client approves or rejects a gallery item.
 * Auth model: gallery is exposed via the proposal share token (caller passes ?token=...).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  approved: z.boolean(),
  clientNote: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const proposal = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!proposal) return NextResponse.json({ error: 'Bad token' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({
    where: { id, OR: [{ proposalId: proposal.id }, { tenantId: proposal.tenantId, visibility: 'CLIENT' }] },
  });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const item = await prisma.galleryItem.update({
    where: { id: itemId },
    data: { approved: parsed.data.approved, clientNote: parsed.data.clientNote },
  });
  return NextResponse.json({ item });
}
