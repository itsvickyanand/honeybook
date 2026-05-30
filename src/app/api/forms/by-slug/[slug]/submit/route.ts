/**
 * Public endpoint — client/visitor submits a lead capture form.
 * Creates a Contact + Lead in the form's tenant + (optionally) enrolls them
 * in a drip sequence with trigger=lead.created.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { enqueue, JOB_NAMES } from '@/lib/queue';
import { enforceRateLimit } from '@/lib/api';
import { applyScoringRules } from '@/lib/lead-scoring';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const blocked = await enforceRateLimit(req, { keyPrefix: `form.${slug}`, limit: 20, windowMs: 60_000 });
  if (blocked) return blocked;
  const form = await prisma.leadForm.findUnique({ where: { slug } });
  if (!form || !form.active) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const name = body.name ?? body.fullName ?? body.full_name ?? 'Anonymous';
  const email = body.email ?? null;
  const phone = body.phone ?? body.contact ?? null;

  const contact = await prisma.contact.create({
    data: {
      tenantId: form.tenantId,
      fullName: name,
      email,
      phone,
      source: `form:${form.slug}`,
      notes: Object.entries(body).map(([k, v]) => `${k}: ${v}`).join('\n'),
    },
  });

  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: form.tenantId, isDefault: true },
    include: { stages: { orderBy: { sortOrder: 'asc' }, take: 1 } },
  });
  if (pipeline) {
    const lead = await prisma.lead.create({
      data: {
        tenantId: form.tenantId,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0].id,
        contactId: contact.id,
        title: `Lead from ${form.name}`,
        source: form.slug,
      },
    });
    // Score
    const score = await applyScoringRules(form.tenantId, { ...body, source: form.slug });
    if (score > 0) await prisma.lead.update({ where: { id: lead.id }, data: { score } });
  }

  // Enroll into matching drip sequences
  const seqs = await prisma.dripSequence.findMany({
    where: { tenantId: form.tenantId, trigger: 'lead.created', active: true },
  });
  for (const seq of seqs) {
    const enrollment = await prisma.dripEnrollment.create({
      data: { tenantId: form.tenantId, sequenceId: seq.id, contactId: contact.id, status: 'ACTIVE' },
    });
    const steps = (seq.stepsJson as unknown as { delayHours: number }[]) ?? [];
    if (steps[0]) {
      await enqueue(JOB_NAMES.DRIP_STEP, { enrollmentId: enrollment.id, stepIdx: 0 }, {
        delay: steps[0].delayHours * 60 * 60 * 1000,
      });
    }
  }

  // Notify
  await prisma.notification.create({
    data: {
      tenantId: form.tenantId,
      type: 'lead.new',
      title: `New lead from ${form.name}`,
      body: `${name}${email ? ` · ${email}` : ''}`,
      href: `/app/leads`,
    },
  });

  return NextResponse.json({
    ok: true,
    redirectUrl: form.redirectUrl,
  });
}
