import { NextResponse } from 'next/server';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const schema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

export async function GET() {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const hooks = await prisma.outboundWebhook.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ hooks });
}

export async function POST(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const hook = await prisma.outboundWebhook.create({
    data: {
      tenantId: auth.tenant.id,
      url: parsed.data.url,
      events: parsed.data.events as object,
      secret: nanoid(32),
    },
  });
  return NextResponse.json({ hook });
}
