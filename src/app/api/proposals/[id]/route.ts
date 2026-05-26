import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { proposalDocSchema, computeTotals } from '@/lib/proposal-schema';
import { sendEmail } from '@/lib/comms';
import { emailProposalSent } from '@/lib/comms/templates';

async function loadOwned(id: string, tenantId: string) {
  return prisma.proposal.findFirst({ where: { id, tenantId } });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const p = await loadOwned(id, auth.tenant.id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ proposal: { ...p, content: p.contentJson } });
}

const patchSchema = z.object({
  content: proposalDocSchema.optional(),
  status: z
    .enum(['DRAFT', 'SENT', 'VIEWED', 'CHANGES_REQUESTED', 'ACCEPTED', 'DECLINED', 'EXPIRED'])
    .optional(),
  title: z.string().min(1).max(160).optional(),
  clientName: z.string().min(1).max(120).optional(),
  clientEmail: z.string().email().nullable().optional(),
  note: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const p = await loadOwned(id, auth.tenant.id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.title) data.title = parsed.data.title;
  if (parsed.data.clientName) data.clientName = parsed.data.clientName;
  if (parsed.data.clientEmail !== undefined) data.clientEmail = parsed.data.clientEmail || null;
  if (parsed.data.status) {
    data.status = parsed.data.status;
    if (parsed.data.status === 'SENT' && !p.sentAt) {
      data.sentAt = new Date();
      // Fire transactional email to client if we have one
      if (p.clientEmail) {
        const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId } });
        if (tenant) {
          const tmpl = emailProposalSent({
            clientName: p.clientName ?? 'there',
            vendorName: tenant.name,
            portalUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${p.shareToken}`,
            total: p.total,
            currency: tenant.currency,
            locale: tenant.locale,
          });
          await sendEmail({ to: p.clientEmail, ...tmpl });
        }
      }
    }
    if (parsed.data.status === 'ACCEPTED' && !p.acceptedAt) data.acceptedAt = new Date();
  }

  if (parsed.data.content) {
    const doc = parsed.data.content;
    const totals = computeTotals(doc);
    data.contentJson = doc as unknown as object;
    data.subtotal = totals.subtotal;
    data.taxAmount = totals.taxAmount;
    data.discount = totals.discount;
    data.total = totals.total;
    data.currentVersion = p.currentVersion + 1;
    // Snapshot a version
    await prisma.proposalVersion.create({
      data: {
        proposalId: p.id,
        version: p.currentVersion + 1,
        contentJson: doc as unknown as object,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        discount: totals.discount,
        total: totals.total,
        authoredBy: auth.user.id,
        note: parsed.data.note ?? 'Edited by vendor',
      },
    });
  }

  const updated = await prisma.proposal.update({ where: { id }, data });
  return NextResponse.json({ proposal: { ...updated, content: updated.contentJson } });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const p = await loadOwned(id, auth.tenant.id);
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.proposal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
