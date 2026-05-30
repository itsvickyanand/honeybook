/**
 * Stage C — LLM composition.
 *
 * Receives the retrieved rows + tenant AI config + parsed brief, asks Claude
 * to compose a proposal that ONLY uses the retrieved rows.
 *
 * Falls back to a deterministic composer when no API key is set, so the
 * pipeline always returns something.
 */
import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import { ProposalDoc, proposalDocSchema, computeTotals } from '../proposal-schema';
import { ParsedBrief, CatalogRetrieval } from './types';

export interface ComposeArgs {
  brief: string;
  parsed: ParsedBrief;
  rows: CatalogRetrieval[];
  vendorName: string;
  vendorBusinessType: string;
  clientName: string;
  currency: string;
  taxRate: number;
  taxLabel: string;
  tone: string;
  upsellAggressiveness: number;
  customInstructions?: string;
}

export async function composeProposal(args: ComposeArgs): Promise<ProposalDoc> {
  if (!process.env.ANTHROPIC_API_KEY) return fallbackCompose(args);
  try {
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sys = systemPrompt(args);
    const user = userPrompt(args);
    const resp = await ai.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5',
      max_tokens: 4000,
      temperature: 0.4,
      system: sys,
      messages: [{ role: 'user', content: user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const json = extractJson(text);
    const raw = JSON.parse(json);
    const stamped = stampIds(raw);
    const doc = proposalDocSchema.parse(stamped);
    finishDoc(doc, args);
    return doc;
  } catch (e) {
    console.error('Stage C compose failed, using fallback', e);
    return fallbackCompose(args);
  }
}

function finishDoc(doc: ProposalDoc, args: ComposeArgs) {
  doc.vendorName = args.vendorName;
  doc.clientName = args.clientName;
  doc.currency = args.currency;
  doc.taxRate = args.taxRate;
  doc.taxLabel = args.taxLabel;
  computeTotals(doc);
}

function systemPrompt(args: ComposeArgs): string {
  const upsellGuide = ['Off — only include what is requested.', 'Subtle — one tasteful add-on at most.', 'Balanced — propose 1–2 logical upsells.', 'Aggressive — propose premium tiers and add-ons across sections.'][args.upsellAggressiveness] ?? 'Balanced';
  return `You are a senior sales consultant for "${args.vendorName}" (a ${args.vendorBusinessType} business).
You receive: (1) a client brief, (2) parsed brief fields, (3) a CURATED CATALOG of pre-filtered rows.
Your job: write a proposal that uses ONLY the catalog rows provided — do not invent items, prices, or terms.

Rules:
  • Tone: ${args.tone}.
  • Upsell: ${upsellGuide}
  • Group items into 3–6 sections by event stage or category.
  • Set realistic quantities using the parsed brief (guests, days, etc.). Use the
    EXACT counts the brief implies — never inflate. Per-plate items use the guest
    count; per-day items use the number of days; one-off services use quantity 1.
  • Prefer the most relevant 4–8 items overall; a tight, well-priced proposal
    converts better than an exhaustive one.
  • If a catalog row has a price column (price, pricePerPlate, rate*, fee), use that as unitPrice. Do NOT change prices.
  • Currency: ${args.currency}; do not include currency symbols in numeric fields.
  • Output ONLY a JSON object matching:
{
  "title": string,
  "greeting": string,
  "intro": string,
  "sections": [
    {
      "title": string,
      "intro": string,
      "items": [
        {
          "sourceTableSlug": string,
          "sourceRowId": string,
          "name": string,
          "description": string,
          "quantity": number,
          "unit": string,
          "unitPrice": number
        }
      ]
    }
  ],
  "inclusions": string[],
  "terms": string[],
  "validityDays": 14,
  "discount": 0
}
${args.customInstructions ? `Additional vendor instructions:\n${args.customInstructions}` : ''}`;
}

function userPrompt(args: ComposeArgs): string {
  const catalogStr = args.rows
    .map((r) => {
      const entries = Object.entries(r.data)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : JSON.stringify(v)}`)
        .join(' · ');
      return `- table=${r.tableSlug} id=${r.rowId} | ${entries}`;
    })
    .join('\n');
  return `Client: ${args.clientName}

Brief:
"""
${args.brief}
"""

Parsed brief:
${JSON.stringify(args.parsed, null, 2)}

Curated catalog (use ONLY these rows):
${catalogStr}

Return a single JSON object.`;
}

function extractJson(s: string): string {
  const start = s.indexOf('{');
  if (start === -1) throw new Error('No JSON');
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

function stampIds(raw: unknown): unknown {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.sections)) {
      obj.sections = obj.sections.map((sec: unknown) => {
        const secObj = (sec ?? {}) as Record<string, unknown>;
        const s: Record<string, unknown> = { ...secObj, id: nanoid(8) };
        if (Array.isArray(s.items)) {
          s.items = (s.items as unknown[]).map((it) => {
            const itObj = (it ?? {}) as Record<string, unknown>;
            return { ...itObj, id: nanoid(8), alternates: itObj.alternates ?? [] };
          });
        }
        return s;
      });
    }
  }
  return raw;
}

/** Fallback: bucket retrieved rows into sections by tableSlug, qty=1 each. */
function fallbackCompose(args: ComposeArgs): ProposalDoc {
  const byTable = new Map<string, CatalogRetrieval[]>();
  for (const r of args.rows) {
    if (!byTable.has(r.tableSlug)) byTable.set(r.tableSlug, []);
    byTable.get(r.tableSlug)!.push(r);
  }
  const sections = Array.from(byTable.entries()).slice(0, 4).map(([slug, rows]) => ({
    id: nanoid(8),
    title: slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    intro: '',
    items: rows.slice(0, 4).map((r) => {
      const data = r.data as Record<string, unknown>;
      const priceKey = ['price', 'pricePerPlate', 'fee', 'ratePerDay', 'ratePerEvent', 'startingPrice', 'pricePerUnit'].find((k) => typeof data[k] === 'number');
      return {
        id: nanoid(8),
        sourceTableSlug: r.tableSlug,
        sourceRowId: r.rowId,
        name: String(data.name ?? data.item ?? 'Item'),
        description: String(data.description ?? ''),
        quantity: defaultQtyFor(slug, args.parsed),
        unit: priceKey === 'pricePerPlate' ? 'plate' : 'unit',
        unitPrice: typeof priceKey === 'string' ? Number(data[priceKey]) : 0,
        amount: 0,
        alternates: [],
      };
    }),
  }));
  const doc: ProposalDoc = {
    title: `Proposal for ${args.clientName}`,
    greeting: `Dear ${args.clientName},`,
    intro: `Thank you for reaching out to ${args.vendorName}. Based on your brief, here is a curated proposal.`,
    sections,
    inclusions: ['On-ground coordination', 'Taxes shown separately', 'One round of complimentary revision'],
    terms: ['50% advance to confirm; balance 7 days before event.', 'Prices valid for 14 days.'],
    validityDays: 14,
    discount: 0,
    taxRate: args.taxRate,
    taxLabel: args.taxLabel,
    currency: args.currency,
    vendorName: args.vendorName,
    clientName: args.clientName,
  };
  finishDoc(doc, args);
  return doc;
}

function defaultQtyFor(slug: string, p: ParsedBrief): number {
  if (slug.includes('menu') || slug.includes('package')) return p.guestCount ?? 1;
  return 1;
}
