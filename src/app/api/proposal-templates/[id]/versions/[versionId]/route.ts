/**
 * Restore a template to a saved version.
 *
 * POST → copies the version's blocks back onto the template, and (optionally)
 *        takes a fresh snapshot of the pre-restore state first so the user
 *        can undo the restore.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;

  const [tpl, version] = await Promise.all([
    prisma.proposalTemplate.findFirst({ where: { id, tenantId: auth.tenant.id }, select: { id: true, blocks: true } }),
    prisma.proposalTemplateVersion.findFirst({ where: { id: versionId, tenantId: auth.tenant.id, templateId: id }, select: { blocks: true } }),
  ]);
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  // Snapshot the current state first so the restore is itself undoable.
  if (tpl.blocks) {
    await prisma.proposalTemplateVersion.create({
      data: {
        templateId: id,
        tenantId: auth.tenant.id,
        blocks: tpl.blocks as object,
        label: 'Pre-restore snapshot',
      },
    });
  }

  await prisma.proposalTemplate.update({
    where: { id },
    data: { blocks: version.blocks as object },
  });

  return NextResponse.json({ ok: true });
}
