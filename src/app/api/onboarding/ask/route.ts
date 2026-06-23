/**
 * Inline chat helper — returns the single best next clarifying question for the wizard.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { askNext, loadBusinessContext, type OnboardingAnswers } from '@/lib/ai/onboarding';

const schema = z.object({ answers: z.record(z.unknown()) });

export async function POST(req: Request) {
  const auth = await requireApi('contact.view');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });
  const ctx = await loadBusinessContext(auth.tenant.id);
  const out = await askNext(parsed.data.answers as OnboardingAnswers, ctx);
  return NextResponse.json(out);
}
