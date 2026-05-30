/**
 * UPI AutoPay mandates — create + list.
 * POST creates a Mandate and returns an authUrl the client visits to approve
 * recurring debits (e.g. installment AutoPay). GET lists tenant mandates.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { createAutopayMandate } from '@/lib/payments/razorpay';

export async function GET() {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const mandates = await prisma.mandate.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ mandates });
}

const schema = z.object({
  contactId: z.string().optional(),
  projectId: z.string().optional(),
  maxAmount: z.number().positive(),
  frequency: z.enum(['monthly', 'as_presented']).default('as_presented'),
});

export async function POST(req: Request) {
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  let customer = { name: auth.tenant.name, email: undefined as string | undefined, phone: undefined as string | undefined };
  if (parsed.data.contactId) {
    const c = await prisma.contact.findFirst({ where: { id: parsed.data.contactId, tenantId: auth.tenant.id } });
    if (c) customer = { name: c.fullName, email: c.email ?? undefined, phone: c.phone ?? undefined };
  }

  const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
  let res;
  try {
    res = await createAutopayMandate({
      maxAmountInRupees: parsed.data.maxAmount,
      customer,
      description: `AutoPay mandate · ${auth.tenant.name}`,
      callbackUrl: `${appUrl}/app/projects/${parsed.data.projectId ?? ''}`,
    });
  } catch (e) {
    return NextResponse.json({ error: 'gateway_error', detail: (e as Error).message.slice(0, 200) }, { status: 400 });
  }

  const mandate = await prisma.mandate.create({
    data: {
      tenantId: auth.tenant.id,
      contactId: parsed.data.contactId,
      projectId: parsed.data.projectId,
      provider: 'razorpay',
      providerRef: res.providerRef,
      maxAmount: parsed.data.maxAmount,
      frequency: parsed.data.frequency,
      status: 'PENDING',
      authUrl: res.authUrl,
    },
  });

  return NextResponse.json({ mandate, authUrl: res.authUrl }, { status: 201 });
}
