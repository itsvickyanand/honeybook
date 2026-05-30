import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

const stepSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'sms']),
  delayHours: z.number().int().nonnegative(),
  subject: z.string().optional(),
  body: z.string().min(1),
});
const schema = z.object({
  name: z.string().min(1),
  trigger: z.enum(['lead.created', 'proposal.sent', 'proposal.viewed', 'manual']),
  steps: z.array(stepSchema).min(1),
  active: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const sequences = await prisma.dripSequence.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ sequences });
}

export async function POST(req: Request) {
  const auth = await requireApi('settings.manage');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const seq = await prisma.dripSequence.create({
    data: {
      tenantId: auth.tenant.id,
      name: parsed.data.name,
      trigger: parsed.data.trigger,
      stepsJson: parsed.data.steps as object,
      active: parsed.data.active ?? true,
    },
  });
  return NextResponse.json({ sequence: seq });
}
