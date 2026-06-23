/**
 * Extract structured fields from a free-text business brief (Step 1 of the wizard).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { extractFromBrief, loadBusinessContext } from '@/lib/ai/onboarding';

const schema = z.object({ brief: z.string().min(20).max(4000) });

export async function POST(req: Request) {
  const auth = await requireApi('contact.edit');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Need at least ~20 chars of context' }, { status: 400 });

  const ctx = await loadBusinessContext(auth.tenant.id);
  const extracted = await extractFromBrief(parsed.data.brief, ctx);
  return NextResponse.json({ extracted });
}
