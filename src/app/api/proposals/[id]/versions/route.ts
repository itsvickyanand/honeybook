/**
 * List proposal versions in chronological order.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const versions = await prisma.proposalVersion.findMany({
    where: { proposalId: id, proposal: { tenantId: auth.tenant.id } },
    orderBy: { version: 'asc' },
  });
  return NextResponse.json({ versions });
}
