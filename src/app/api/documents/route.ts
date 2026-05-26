import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const proposalId = url.searchParams.get('proposalId');
  const docs = await prisma.document.findMany({
    where: { tenantId: auth.tenant.id, ...(proposalId && { proposalId }) },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ documents: docs });
}

const schema = z.object({
  category: z.enum(['CONTRACT', 'VISA', 'INVOICE_PDF', 'RECEIPT', 'OTHER']).optional(),
  title: z.string().min(1),
  proposalId: z.string().optional(),
  fileId: z.string().optional(),
  status: z.enum(['DRAFT', 'REQUESTED', 'UPLOADED', 'APPROVED', 'REJECTED']).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const doc = await prisma.document.create({
    data: {
      tenantId: auth.tenant.id,
      category: parsed.data.category ?? 'OTHER',
      title: parsed.data.title,
      proposalId: parsed.data.proposalId,
      fileId: parsed.data.fileId,
      status: parsed.data.status ?? 'REQUESTED',
    },
  });
  return NextResponse.json({ document: doc });
}
