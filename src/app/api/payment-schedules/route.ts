/**
 * Payment schedules API.
 *
 * POST creates a schedule + N items for a project (or for a proposal).
 * GET  lists schedules for a project.
 *
 * Items are expanded into invoices by a daily cron (see /api/cron/payment-schedule-due).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const schedules = await prisma.paymentSchedule.findMany({
    where: { tenantId: auth.tenant.id, projectId: projectId ?? undefined },
    include: { items: { orderBy: { dueDate: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ schedules });
}

const itemSchema = z.object({
  label: z.string().min(1).max(120),
  amount: z.number().positive(),
  percent: z.number().min(0).max(100).optional(),
  dueDate: z.string().datetime(),
});
const createSchema = z.object({
  projectId: z.string().optional(),
  proposalId: z.string().optional(),
  totalAmount: z.number().positive(),
  currency: z.string().default('INR'),
  items: z.array(itemSchema).min(1).max(12),
});

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid', issues: parsed.error.flatten() }, { status: 400 });

  const sum = parsed.data.items.reduce((s, i) => s + i.amount, 0);
  if (Math.abs(sum - parsed.data.totalAmount) > 0.01) {
    return NextResponse.json({ error: `Items sum to ${sum} but totalAmount is ${parsed.data.totalAmount}` }, { status: 400 });
  }

  const schedule = await prisma.paymentSchedule.create({
    data: {
      tenantId: auth.tenant.id,
      projectId: parsed.data.projectId,
      proposalId: parsed.data.proposalId,
      totalAmount: parsed.data.totalAmount,
      currency: parsed.data.currency,
      items: {
        create: parsed.data.items.map((it, i) => ({
          label: it.label,
          amount: it.amount,
          percent: it.percent,
          dueDate: new Date(it.dueDate),
          sortOrder: i,
        })),
      },
    },
    include: { items: { orderBy: { dueDate: 'asc' } } },
  });
  return NextResponse.json({ schedule }, { status: 201 });
}
