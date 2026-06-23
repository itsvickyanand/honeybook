/**
 * AI rewrite for a single block's text. The builder posts the current text and
 * a tone preset; we return rewritten text. We do NOT mutate the template
 * server-side — the client decides whether to accept the rewrite (and
 * autosave persists it through the existing PATCH).
 *
 * POST /api/proposal-templates/[id]/rewrite
 *   body: { text: string; tone: 'warm'|'formal'|'concise'|'playful'|'custom';
 *           customInstruction?: string;
 *           kind?: 'plain' | 'html'; // tells Claude what shape to emit }
 *   → { text: string }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requireApi } from '@/lib/api';
import { logger } from '@/lib/logger';

const schema = z.object({
  text: z.string().min(1).max(8000),
  tone: z.enum(['warm', 'formal', 'concise', 'playful', 'custom']),
  customInstruction: z.string().max(500).optional(),
  kind: z.enum(['plain', 'html']).optional(),
});

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5-20251008';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await params; // we don't need to load the template for this — tone + text is enough
  const auth = await requireApi('proposal.create');
  if ('error' in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const { text, tone, customInstruction, kind } = parsed.data;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // No-key fallback — return a deterministic stub so the UI flow stays consistent.
    return NextResponse.json({ text, mock: true });
  }

  const toneGuide: Record<typeof tone, string> = {
    warm: 'Friendly, personable, uses contractions. Like a thoughtful note to a familiar client.',
    formal: 'Professional, polished, complete sentences. Suitable for corporate proposals.',
    concise: 'Tight. No filler. Short sentences. The fewest words that carry the meaning.',
    playful: 'Light, a touch of humor, conversational. Still respectful of business context.',
    custom: customInstruction ?? 'Improve the writing.',
  };

  try {
    const ai = new Anthropic({ apiKey });
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You rewrite proposal copy. Preserve any {{mergeFields}} verbatim (they're substituted later). Preserve the original meaning. ${kind === 'html' ? 'Output HTML matching the input shape (e.g. if input has <p>/<strong>/<a> keep them).' : 'Output plain text only — no HTML.'} No preamble, no quotes around the output — return ONLY the rewritten copy.

Tone guidance: ${toneGuide[tone]}`,
      messages: [{ role: 'user', content: text }],
    });
    const out = (resp.content[0] as { text: string }).text.trim();
    return NextResponse.json({ text: out, mock: false });
  } catch (e) {
    logger.error({ err: (e as Error).message, tenantId: auth.tenant.id }, 'tpl.rewrite.failed');
    return NextResponse.json({ error: 'Could not rewrite — try again.' }, { status: 502 });
  }
}
