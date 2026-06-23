import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { onProposalStatusChanged } from '@/lib/lifecycle';
import { createSignRequest } from '@/lib/esign/digio';
import { logger } from '@/lib/logger';

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

  // On ACCEPT, create an e-sign request (Digio; mock when unconfigured) so the
  // contract-signing step exists. Idempotent: skip if one already exists.
  let signingUrl: string | null = null;
  if (parsed.data.decision === 'ACCEPT') {
    try {
      const existing = await prisma.signatureRequest.findFirst({
        where: { proposalId: p.id, status: { in: ['PENDING', 'SENT', 'SIGNED'] } },
      });
      if (!existing) {
        const sig = await createSignRequest({
          signerName: p.clientName ?? 'Client',
          signerEmail: p.clientEmail ?? 'client@example.com',
          documentBase64: '', // PDF is rendered async by the worker; Digio link flow doesn't block on it in mock
          filename: `${p.title}-agreement.pdf`,
          redirectUrl: `${process.env.APP_URL ?? new URL(req.url).origin}/p/${token}?signed=1`,
        }, p.tenantId);
        await prisma.signatureRequest.create({
          data: {
            tenantId: p.tenantId,
            proposalId: p.id,
            provider: sig.mock ? 'mock' : 'digio',
            externalId: sig.externalId,
            signerName: p.clientName ?? 'Client',
            signerEmail: p.clientEmail ?? '',
            signerPhone: undefined,
            status: 'SENT',
            payload: { signingUrl: sig.signingUrl } as object,
            expiresAt: new Date(Date.now() + 14 * 86400_000),
          },
        });
        signingUrl = sig.mock ? `/p/${token}?sign=mock` : sig.signingUrl;
      }
    } catch (e) {
      logger.warn({ proposalId: p.id, err: (e as Error).message }, 'accept.esign.failed');
    }
  }

  return NextResponse.json({ ok: true, signingUrl });
}
