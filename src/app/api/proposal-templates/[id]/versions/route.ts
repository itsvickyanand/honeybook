/**
 * Template version history.
 *
 *   GET  → list the last 5 snapshots
 *   POST → take a snapshot of the current template.blocks (used by autosave
 *          + builder on explicit save). Prunes anything past the most-recent 5.
 *
 * The version count cap keeps storage bounded — we don't need a full undo
 * stack, just "let me roll back if I broke something today."
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const MAX_VERSIONS = 5;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const versions = await prisma.proposalTemplateVersion.findMany({
    where: { templateId: id, tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: MAX_VERSIONS,
    select: { id: true, label: true, createdAt: true },
  });
  return NextResponse.json({ versions });
}

const postSchema = z.object({ label: z.string().max(80).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const tpl = await prisma.proposalTemplate.findFirst({
    where: { id, tenantId: auth.tenant.id },
    select: { blocks: true },
  });
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!tpl.blocks) return NextResponse.json({ error: 'Template has no blocks yet' }, { status: 400 });

  const version = await prisma.proposalTemplateVersion.create({
    data: {
      templateId: id,
      tenantId: auth.tenant.id,
      blocks: tpl.blocks as object,
      label: parsed.data.label,
    },
    select: { id: true, label: true, createdAt: true },
  });

  // Prune older versions past the cap.
  const all = await prisma.proposalTemplateVersion.findMany({
    where: { templateId: id, tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (all.length > MAX_VERSIONS) {
    await prisma.proposalTemplateVersion.deleteMany({
      where: { id: { in: all.slice(MAX_VERSIONS).map((v) => v.id) } },
    });
  }

  return NextResponse.json({ version });
}
