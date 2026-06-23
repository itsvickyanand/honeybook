/**
 * Generate the AI draft (proposalTemplate / contractTemplate / catalog / aiConfig).
 * Persists the result on the session so the wizard can render it on Review.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { generateProfile, loadBusinessContext, type OnboardingAnswers } from '@/lib/ai/onboarding';

const schema = z.object({ answers: z.record(z.unknown()).optional() });

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const session = await prisma.onboardingSession.findFirst({
    where: { tenantId: auth.tenant.id, status: 'DRAFT' },
    orderBy: { updatedAt: 'desc' },
  });
  const answers = (parsed.data.answers ?? session?.answers ?? {}) as OnboardingAnswers;

  const ctx = await loadBusinessContext(auth.tenant.id);
  const draft = await generateProfile(answers, ctx);

  if (session) {
    await prisma.onboardingSession.update({
      where: { id: session.id },
      data: { generatedDraft: draft as object, answers: answers as object },
    });
  } else {
    await prisma.onboardingSession.create({
      data: { tenantId: auth.tenant.id, answers: answers as object, generatedDraft: draft as object },
    });
  }
  return NextResponse.json({ draft });
}
