import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { onProposalStatusChanged } from '@/lib/lifecycle';

const schema = z.object({ decision: z.enum(['ACCEPT', 'DECLINE']), note: z.string().max(500).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await prisma.proposal.findUnique({ where: { shareToken: token } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const newStatus = parsed.data.decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
  const oldStatus = p.status;
  await prisma.$transaction([
    prisma.proposal.update({
      where: { id: p.id },
      data: {
        status: newStatus,
        ...(parsed.data.decision === 'ACCEPT' && { acceptedAt: new Date() }),
      },
    }),
    prisma.proposalEvent.create({
      data: {
        proposalId: p.id,
        type: newStatus,
        actor: 'client',
        payload: parsed.data.note ? ({ note: parsed.data.note } as object) : undefined,
      },
    }),
  ]);

  // Fan-out — non-blocking, errors are swallowed inside.
  onProposalStatusChanged(p.id, newStatus, oldStatus).catch(() => {});

  return NextResponse.json({ ok: true });
}
