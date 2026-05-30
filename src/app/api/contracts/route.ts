/**
 * Contract templates (customizable agreements). GET list, POST create.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { DEFAULT_CONTRACT_HTML } from '@/lib/contracts';

export async function GET() {
  const auth = await requireApi('proposal.view');
  if ('error' in auth) return auth.error;
  const templates = await prisma.contractTemplate.findMany({
    where: { tenantId: auth.tenant.id, archived: false },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json({ templates });
}

const schema = z.object({
  name: z.string().min(1).max(120),
  bodyHtml: z.string().optional(),
  isDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  if (parsed.data.isDefault) {
    await prisma.contractTemplate.updateMany({ where: { tenantId: auth.tenant.id }, data: { isDefault: false } });
  }
  const template = await prisma.contractTemplate.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      bodyHtml: parsed.data.bodyHtml ?? DEFAULT_CONTRACT_HTML,
      isDefault: parsed.data.isDefault ?? false,
    },
  });
  return NextResponse.json({ template }, { status: 201 });
}
