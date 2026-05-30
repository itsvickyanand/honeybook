/**
 * Start a Project from an Opportunity (lead) WITHOUT payment.
 *
 * POST { leadId, advanceToWon?: boolean }
 *   → creates/links a Project (+ seeds tasks), optionally moves the lead to its
 *     Won stage. Lets a vendor begin delivery before any money is collected.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { ensureProjectForLead, advanceLeadToStage } from '@/lib/lifecycle';

const schema = z.object({
  leadId: z.string(),
  advanceToWon: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const auth = await requireApi('project.manage');
  if ('error' in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const lead = await prisma.lead.findFirst({
    where: { id: parsed.data.leadId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!lead) return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });

  const project = await ensureProjectForLead(auth.tenant.id, parsed.data.leadId);
  if (!project) return NextResponse.json({ error: 'Could not create project' }, { status: 500 });

  if (parsed.data.advanceToWon) {
    await advanceLeadToStage(parsed.data.leadId, 'Won', 'Project started from opportunity').catch(() => {});
  }

  return NextResponse.json({ project, created: project.created }, { status: project.created ? 201 : 200 });
}
