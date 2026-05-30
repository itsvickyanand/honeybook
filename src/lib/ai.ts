/**
 * Claude-powered proposal generator.
 * Reads the tenant's CustomTable/Row catalog and asks Claude for a structured proposal.
 * Falls back to a deterministic local generator if ANTHROPIC_API_KEY is missing,
 * so the app remains fully demo-able without a key.
 */
import Anthropic from '@anthropic-ai/sdk';
import { nanoid } from 'nanoid';
import { prisma } from './db';
import { ProposalDoc, proposalDocSchema, computeTotals } from './proposal-schema';

const MODEL = 'claude-sonnet-4-5';

export interface GenerateInput {
  tenantId: string;
  brief: string;
  clientName: string;
  vendorName: string;
  vendorBusinessType: string;
  taxRate: number;
  taxLabel: string;
  currency: string;
}

export async function generateProposal(input: GenerateInput): Promise<ProposalDoc> {
  const catalog = await loadCatalogContext(input.tenantId);

  // No API key → deterministic fallback (demo-friendly)
  if (!process.env.ANTHROPIC_API_KEY) {
    return fallbackProposal(input, catalog);
  }

  try {
    const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const sys = systemPrompt(input);
    const user = userPrompt(input, catalog);

    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 4000,
      temperature: 0.4,
      system: sys,
      messages: [{ role: 'user', content: user }],
    });

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr);
    const doc = proposalDocSchema.parse(stampIds(parsed));
    doc.vendorName = input.vendorName;
    doc.clientName = input.clientName;
    doc.taxRate = input.taxRate;
    doc.taxLabel = input.taxLabel;
    doc.currency = input.currency;
    computeTotals(doc);
    return doc;
  } catch (e) {
    console.error('AI generation failed, falling back', e);
    return fallbackProposal(input, catalog);
  }
}

// ─── prompts ────────────────────────────────────────────────────────────────
function systemPrompt(i: GenerateInput) {
  return `You are a senior sales consultant for a ${i.vendorBusinessType} business named "${i.vendorName}".
You receive a client brief and a catalog of items the business offers. Your job is to draft a CURATED PROPOSAL
that:
  • Picks items from the catalog (do not invent items that aren't in the catalog).
  • Groups them into logical sections (e.g., "Pre-Event", "Main Day", "Add-ons").
  • Suggests realistic quantities based on the brief (guest count, duration, etc.).
  • Writes a warm, professional intro and section blurbs.
  • Includes 3–6 standard inclusions and 3–5 commercial terms.
  • Returns ONLY a single valid JSON object — no prose before or after.

Output JSON shape:
{
  "title": "string",
  "greeting": "string",
  "intro": "string (2-4 sentences)",
  "sections": [
    {
      "title": "string",
      "intro": "string (1-2 sentences)",
      "items": [
        {
          "sourceTableSlug": "string (from catalog)",
          "sourceRowId": "string (from catalog row id)",
          "name": "string",
          "description": "string (short, optional)",
          "quantity": number,
          "unit": "string (plate / piece / day / hr)",
          "unitPrice": number
        }
      ]
    }
  ],
  "inclusions": ["string", ...],
  "terms": ["string", ...],
  "validityDays": 14,
  "discount": 0
}

Important:
  • currency is ${i.currency}; do NOT include any currency symbols inside numeric fields.
  • Match unitPrice to the catalog's price columns where available (pricePerPlate, price, fee, ratePerDay, etc.).
  • Prefer 3–5 sections, 2–6 items per section.`;
}

function userPrompt(i: GenerateInput, catalog: CatalogContext) {
  return `Client: ${i.clientName}

Brief from salesperson:
"""
${i.brief}
"""

Available catalog (use these items — pick the most appropriate, set realistic quantities):

${formatCatalogForPrompt(catalog)}

Return a single JSON object matching the schema in the system prompt.`;
}

// ─── catalog loader ─────────────────────────────────────────────────────────
interface CatalogContext {
  tables: {
    slug: string;
    name: string;
    columns: { slug: string; name: string; type: string }[];
    rows: { id: string; data: Record<string, unknown> }[];
  }[];
}

async function loadCatalogContext(tenantId: string): Promise<CatalogContext> {
  const tables = await prisma.customTable.findMany({
    where: { tenantId },
    include: {
      columns: { orderBy: { sortOrder: 'asc' } },
      rows: { orderBy: { createdAt: 'desc' }, take: 50 }, // cap per table for context budget
    },
    orderBy: { sortOrder: 'asc' },
  });
  return {
    tables: tables.map((t) => ({
      slug: t.slug,
      name: t.name,
      columns: t.columns.map((c) => ({ slug: c.slug, name: c.name, type: c.type })),
      rows: t.rows.map((r) => ({ id: r.id, data: r.data as Record<string, unknown> })),
    })),
  };
}

function formatCatalogForPrompt(catalog: CatalogContext): string {
  const parts: string[] = [];
  for (const t of catalog.tables) {
    parts.push(`### Table: ${t.name} (slug: ${t.slug})`);
    parts.push(`Columns: ${t.columns.map((c) => `${c.slug}(${c.type})`).join(', ')}`);
    parts.push('Rows:');
    for (const r of t.rows) {
      const summary = Object.entries(r.data)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : JSON.stringify(v)}`)
        .join(' · ');
      parts.push(`  - id=${r.id} | ${summary}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

// ─── JSON extraction & ids ──────────────────────────────────────────────────
function extractJson(s: string): string {
  // Find the first { and the matching closing }
  const start = s.indexOf('{');
  if (start === -1) throw new Error('No JSON in AI response');
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new Error('Unbalanced JSON in AI response');
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
            return {
              ...itObj,
              id: nanoid(8),
              alternates: itObj.alternates ?? [],
            };
          });
        }
        return s;
      });
    }
  }
  return raw;
}

// ─── fallback: pick items from the catalog by simple keyword overlap ────────
function fallbackProposal(i: GenerateInput, catalog: CatalogContext): ProposalDoc {
  // Heuristic: take up to 5 rows from each of the first 3 tables, choose price-ish column.
  const sections = catalog.tables.slice(0, 3).map((t) => {
    const priceCol = t.columns.find((c) => c.type === 'CURRENCY')?.slug;
    const nameCol = t.columns.find((c) => c.type === 'TEXT')?.slug ?? t.columns[0]?.slug;
    const items = t.rows.slice(0, 4).map((r) => {
      const name = String(r.data[nameCol ?? ''] ?? 'Item');
      const unitPrice = priceCol ? Number(r.data[priceCol] ?? 0) : 0;
      return {
        id: nanoid(8),
        sourceTableSlug: t.slug,
        sourceRowId: r.id,
        name,
        description: '',
        quantity: 1,
        unit: 'unit',
        unitPrice,
        amount: unitPrice,
        alternates: [],
      };
    });
    return { id: nanoid(8), title: t.name, intro: `Selected ${t.name.toLowerCase()} for your event.`, items };
  });

  const doc: ProposalDoc = {
    title: `Proposal for ${i.clientName}`,
    greeting: `Dear ${i.clientName},`,
    intro: `Thank you for reaching out to ${i.vendorName}. Based on your brief, we've put together the following curated proposal for your consideration. Every line item is editable — feel free to swap quantities or request changes directly.`,
    sections,
    inclusions: [
      'On-ground coordination on the day of the event',
      'All taxes shown separately below',
      'One round of complimentary revision',
    ],
    terms: [
      '50% advance to confirm the booking; balance 7 days prior to event date.',
      'Cancellations within 14 days of the event are non-refundable.',
      'Prices valid for 14 days from the date of this proposal.',
    ],
    validityDays: 14,
    discount: 0,
    taxRate: i.taxRate,
    taxLabel: i.taxLabel,
    currency: i.currency,
    vendorName: i.vendorName,
    clientName: i.clientName,
  };
  computeTotals(doc);
  return doc;
}
