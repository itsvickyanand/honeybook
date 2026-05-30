import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const contacts = await prisma.contact.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ contacts });
}

const schema = z.object({
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal('')).optional(),
  phone: z.string().max(40).optional(),
  company: z.string().max(120).optional(),
  source: z.string().max(40).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const c = await prisma.contact.create({
    data: {
      tenantId: auth.tenant.id,
      fullName: parsed.data.fullName,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      company: parsed.data.company || null,
      source: parsed.data.source || null,
      notes: parsed.data.notes || null,
    },
  });
  return NextResponse.json({ contact: c });
}
