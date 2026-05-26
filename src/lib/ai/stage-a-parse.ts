/**
 * Stage A — parse free-text brief into structured constraints.
 *
 * Cheap heuristic first pass (works without API key), then LLM-augmented
 * if ANTHROPIC_API_KEY is set. Output validated by Zod.
 */
import Anthropic from '@anthropic-ai/sdk';
import { parsedBriefSchema, ParsedBrief } from './types';

export async function parseBrief(brief: string): Promise<ParsedBrief> {
  const heuristic = heuristicParse(brief);
  if (!process.env.ANTHROPIC_API_KEY) return heuristic;

  try {
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sys = `Extract structured fields from a client brief. Return ONLY valid JSON matching this schema:
{
  "guestCount": number|null,
  "eventDates": string[],
  "city": string|null,
  "durationDays": number|null,
  "budgetINR": number|null,
  "budgetINRMin": number|null,
  "budgetINRMax": number|null,
  "dietary": string[],
  "occasion": string|null,
  "mustHaves": string[],
  "niceToHaves": string[],
  "noGos": string[],
  "vibe": string|null,
  "notes": string|null
}
Budgets like "25-30 lakhs" → budgetINRMin=2500000, budgetINRMax=3000000.
"4 lakh per plate" → not a budget.
Return null/empty arrays for unknowns.`;
    const resp = await ai.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 1000,
      temperature: 0.1,
      system: sys,
      messages: [{ role: 'user', content: brief }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const json = extractJson(text);
    const parsed = parsedBriefSchema.parse(JSON.parse(json));
    return { ...heuristic, ...parsed };
  } catch {
    return heuristic;
  }
}

/**
 * Keyword-based fallback. Catches the obvious stuff (guest count, lakhs, veg/non-veg)
 * so we degrade gracefully when the LLM is unavailable.
 */
function heuristicParse(brief: string): ParsedBrief {
  const b = brief.toLowerCase();
  const out: ParsedBrief = {};

  const guestMatch = b.match(/(\d{2,5})\s*(?:guest|pax|people)/);
  if (guestMatch) out.guestCount = Number(guestMatch[1]);

  // "25-30 lakh" range or "25 lakh"
  const lakhRange = b.match(/(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*lakh/);
  if (lakhRange) {
    out.budgetINRMin = Number(lakhRange[1]) * 100_000;
    out.budgetINRMax = Number(lakhRange[2]) * 100_000;
  } else {
    const lakhSingle = b.match(/(?:budget|around|approximately)?\s*(?:of\s+)?(?:inr\s+)?(?:rs\.?\s+)?(\d+(?:\.\d+)?)\s*lakh/);
    if (lakhSingle) out.budgetINR = Number(lakhSingle[1]) * 100_000;
  }
  const croreSingle = b.match(/(\d+(?:\.\d+)?)\s*crore/);
  if (croreSingle) out.budgetINR = Number(croreSingle[1]) * 10_000_000;

  const dietary: string[] = [];
  if (/\bveg(?:etarian)?\b/.test(b) && !/non[- ]?veg/.test(b)) dietary.push('vegetarian');
  if (/non[- ]?veg/.test(b)) dietary.push('non-vegetarian');
  if (/\bvegan\b/.test(b)) dietary.push('vegan');
  if (/\bjain\b/.test(b)) dietary.push('jain');
  if (dietary.length) out.dietary = dietary;

  const cityMatch = brief.match(/\b(Mumbai|Delhi|Bangalore|Bengaluru|Pune|Hyderabad|Chennai|Kolkata|Jaipur|Goa|Udaipur)\b/i);
  if (cityMatch) out.city = cityMatch[1];

  if (/\bwedding\b/.test(b)) out.occasion = 'wedding';
  else if (/sangeet|mehendi|haldi|reception/.test(b)) out.occasion = 'wedding-event';
  else if (/corporate|conference|launch|offsite|gala/.test(b)) out.occasion = 'corporate';
  else if (/birthday|anniversary/.test(b)) out.occasion = 'personal-celebration';

  return out;
}

function extractJson(s: string): string {
  const start = s.indexOf('{');
  if (start === -1) throw new Error('No JSON found');
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced JSON');
}
