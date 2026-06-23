/**
 * AI onboarding orchestrator.
 *
 * Four pure functions used by the /app/onboarding wizard:
 *
 *   - extractFromBrief(text)  →  structured answers from a free-text business brief
 *   - askNext(answers)        →  next clarifying question to ask (chat help)
 *   - generateProfile(answers, ctx) → a Draft of (proposalTemplate, contractTemplate,
 *                                     catalogSeed, aiConfig). Each generator is
 *                                     independent + has a sensible fallback,
 *                                     so a bad one doesn't sink the others.
 *   - applyDraft(tenantId, accepted)
 *                              →  writes the accepted subset to ProposalTemplate,
 *                                  ContractTemplate, CustomTable rows, TenantAIConfig.
 *                                  Marks Tenant.onboardingCompletedAt.
 */
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db';
import { logger } from '../logger';
import {
  DEFAULT_COVER_HTML, DEFAULT_ABOUT_HTML, DEFAULT_SECTION_ORDER,
  STARTER_INCLUSIONS, STARTER_TERMS, STARTER_HOUSE_PHRASES,
} from '../proposals/render';
import { DEFAULT_CONTRACT_HTML } from '../contracts-render';

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-5-20251008';
function client() {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
}

// ─── shared answer shape ──────────────────────────────────────────────────────
export interface OnboardingAnswers {
  brief?: string;
  yearsInBusiness?: number;
  serviceAreas?: string[];
  serviceCategories?: string[];
  signatureOffering?: string;
  typicalEventSize?: string;       // e.g. "150-400 guests"
  priceRange?: { low?: number; high?: number; currency?: string };
  toneHint?: 'warm' | 'formal' | 'concise' | 'playful';
  housePhrases?: string[];
  standardDepositPercent?: number;
  cancellationPolicy?: string;
  outOfScope?: string;             // "what you absolutely don't do"
  typicalLeadTimeDays?: number;
  saleModel?: 'PACKAGES' | 'PER_HEAD' | 'HOURLY' | 'CUSTOM';
  inclusions?: string[];
  exclusions?: string[];
  notes?: string;
}

export interface BusinessContext {
  tenantId: string;
  businessName: string;
  businessTypeName: string;
  businessTypeSlug: string;
  currency: string;
  locale: string;
  ownerFullName?: string;
}

/** Load a complete BusinessContext from a tenantId — joins businessType. */
export async function loadBusinessContext(tenantId: string): Promise<BusinessContext> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { businessType: { select: { name: true, slug: true } } },
  });
  if (!t) throw new Error('Tenant not found');
  return {
    tenantId: t.id,
    businessName: t.name,
    businessTypeName: t.businessType.name,
    businessTypeSlug: t.businessType.slug,
    currency: t.currency,
    locale: t.locale,
  };
}

export interface Draft {
  proposalTemplate: {
    // Legacy fields — kept so existing settings UI doesn't break.
    coverHtml: string;
    aboutHtml: string;
    defaultIntro: string;
    defaultInclusions: string[];
    defaultTerms: string[];
    defaultValidityDays: number;
    defaultDepositPercent: number;
    accentColor: string | null;
    toneHint: 'warm' | 'formal' | 'concise' | 'playful';
    housePhrases: string[];
    /** Block-builder shape — what the new renderer prefers. Derived from the
     *  AI's other outputs (intro → text block, inclusions → inclusions block, etc.)
     *  so AI-onboarded tenants get a builder-ready template immediately. */
    blocks: import('../proposals/blocks').Block[];
  };
  contractTemplate: {
    name: string;
    bodyHtml: string;
  };
  catalog: {
    tableName: string;
    rows: { name: string; description?: string; unitPrice: number; unit: string }[];
  } | null;
  aiConfig: {
    tone: string;
    customInstructions: string;
    mandatoryItemSlugs: string[];
  };
}

// ─── 1. extractFromBrief ──────────────────────────────────────────────────────
export async function extractFromBrief(brief: string, ctx: BusinessContext): Promise<Partial<OnboardingAnswers>> {
  const ai = client();
  if (!ai || brief.trim().length < 20) return { brief, notes: brief };
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You extract structured business info from a brief. Output ONLY JSON matching this schema. Use null for fields not mentioned.
{
  "yearsInBusiness": number|null,
  "serviceAreas": string[]|null,
  "serviceCategories": string[]|null,
  "signatureOffering": string|null,
  "typicalEventSize": string|null,
  "priceRange": { "low": number|null, "high": number|null, "currency": "INR" }|null,
  "toneHint": "warm"|"formal"|"concise"|"playful"|null,
  "housePhrases": string[]|null,
  "standardDepositPercent": number|null,
  "cancellationPolicy": string|null,
  "outOfScope": string|null,
  "typicalLeadTimeDays": number|null,
  "inclusions": string[]|null,
  "exclusions": string[]|null
}`,
      messages: [
        { role: 'user', content: `Business: ${ctx.businessName} (${ctx.businessTypeName}).\n\nBrief:\n${brief}` },
      ],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { brief, notes: brief };
    const parsed = JSON.parse(m[0]) as Partial<OnboardingAnswers>;
    // Clean nulls into undefined and keep the original brief on the side.
    const out: Partial<OnboardingAnswers> = { brief };
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  } catch (e) {
    logger.warn({ err: (e as Error).message }, 'ob.extract.failed');
    return { brief, notes: brief };
  }
}

// ─── 2. askNext — used by the inline chat helper ──────────────────────────────
export async function askNext(answers: OnboardingAnswers, ctx: BusinessContext): Promise<{ question: string; field: string }> {
  const ai = client();
  if (!ai) {
    // Pick the first missing critical field heuristically.
    if (!answers.toneHint) return { question: 'Pick a tone for your proposals.', field: 'toneHint' };
    if (!answers.standardDepositPercent) return { question: 'What deposit % do you usually require to confirm a booking?', field: 'standardDepositPercent' };
    if (!answers.cancellationPolicy) return { question: 'Briefly describe your cancellation policy in your own words.', field: 'cancellationPolicy' };
    return { question: 'Anything else clients always ask you about?', field: 'notes' };
  }
  try {
    const resp = await ai.messages.create({
      model: MODEL,
      max_tokens: 200,
      system: 'You are an onboarding assistant. Given the current answers, return JSON: { "field": "<one of: toneHint|standardDepositPercent|cancellationPolicy|outOfScope|typicalLeadTimeDays|housePhrases|notes>", "question": "<short, conversational question>" }. Pick the single most useful next question to fill the profile. Keep questions warm and under 20 words.',
      messages: [
        { role: 'user', content: `Business: ${ctx.businessName} (${ctx.businessTypeName}).\nCurrent answers:\n${JSON.stringify(answers, null, 2)}` },
      ],
    });
    const text = (resp.content[0] as { text: string }).text;
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    return { question: 'Anything else worth knowing about your business?', field: 'notes' };
  } catch {
    return { question: 'Anything else worth knowing about your business?', field: 'notes' };
  }
}

// ─── 3. generateProfile — runs the 4 generators in parallel ───────────────────
export async function generateProfile(answers: OnboardingAnswers, ctx: BusinessContext): Promise<Draft> {
  const [proposalTemplate, contractTemplate, catalog, aiConfig] = await Promise.all([
    generateProposalTemplate(answers, ctx).catch((e) => {
      logger.warn({ err: (e as Error).message }, 'ob.gen.proposal.failed');
      return fallbackProposalTemplate(answers, ctx);
    }),
    generateContractTemplate(answers, ctx).catch((e) => {
      logger.warn({ err: (e as Error).message }, 'ob.gen.contract.failed');
      return fallbackContractTemplate(answers, ctx);
    }),
    generateCatalog(answers, ctx).catch((e) => {
      logger.warn({ err: (e as Error).message }, 'ob.gen.catalog.failed');
      return null;
    }),
    generateAIConfig(answers, ctx).catch((e) => {
      logger.warn({ err: (e as Error).message }, 'ob.gen.aiConfig.failed');
      return fallbackAIConfig(answers);
    }),
  ]);
  return { proposalTemplate, contractTemplate, catalog, aiConfig };
}

// ─── per-section generators ───────────────────────────────────────────────────
async function generateProposalTemplate(a: OnboardingAnswers, ctx: BusinessContext): Promise<Draft['proposalTemplate']> {
  const ai = client();
  if (!ai) return fallbackProposalTemplate(a, ctx);
  const resp = await ai.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You are an expert proposal copywriter for service businesses. Generate JSON ONLY:
{
  "coverHtml": "<HTML for the cover block, use {{clientName}} {{vendorName}} {{businessName}} {{projectName}} {{date}} {{eventDate}} merge fields>",
  "aboutHtml": "<HTML for an About-us section, in the business's voice>",
  "defaultIntro": "<one-paragraph intro the AI may use as opener>",
  "defaultInclusions": ["string", ...],
  "defaultTerms": ["string", ...],
  "defaultValidityDays": number,
  "defaultDepositPercent": number,
  "accentColor": "#RRGGBB",
  "toneHint": "warm"|"formal"|"concise"|"playful",
  "housePhrases": ["string", ...]
}
Keep copy specific to their stated business, not generic. Inclusions: 5-8. Terms: 4-6. Use Indian Rupee context (₹).`,
    messages: [
      { role: 'user', content: `Business: ${ctx.businessName} (${ctx.businessTypeName}).\nAnswers:\n${JSON.stringify(a, null, 2)}` },
    ],
  });
  const text = (resp.content[0] as { text: string }).text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return fallbackProposalTemplate(a, ctx);
  const parsed = JSON.parse(m[0]) as Omit<Draft['proposalTemplate'], 'blocks'>;
  // Synthesize the block-builder shape from the AI's flat output. We choose the
  // Classic Service shape (cover → about → services → pricing → inclusions →
  // terms → sign) so AI-onboarded tenants land directly inside the new builder
  // with editable blocks instead of opaque HTML.
  return { ...parsed, blocks: deriveBlocksFromTemplate(parsed, a) };
}

/**
 * Translate the AI's flat template output into the new block-builder shape.
 * Picks the Classic Service skeleton and fills it with the AI's intro,
 * inclusions, terms, and house tone. The vendor can drag/reorder/add blocks
 * later in the builder UI (Phase 2) — this just gets them off zero.
 */
function deriveBlocksFromTemplate(
  p: Omit<Draft['proposalTemplate'], 'blocks'>,
  a: OnboardingAnswers,
): import('../proposals/blocks').Block[] {
  const aboutHtml = p.aboutHtml && p.aboutHtml.trim()
    ? p.aboutHtml
    : (p.defaultIntro ? `<p>${p.defaultIntro}</p>` : '<p>About us.</p>');
  return [
    { id: 'b01', type: 'cover',      props: { title: 'Proposal for {{clientName}}', subtitle: '{{vendorName}}', kicker: '{{date}}' } },
    { id: 'b02', type: 'about',      props: { html: aboutHtml, showLogo: true } },
    { id: 'b03', type: 'services',   props: { layout: 'detailed' } },
    { id: 'b04', type: 'pricing',    props: { layout: 'breakdown', showTaxBreakdown: true } },
    { id: 'b05', type: 'inclusions', props: { title: "What's included", items: p.defaultInclusions } },
    { id: 'b06', type: 'terms',      props: { title: 'Terms', items: p.defaultTerms } },
    ...(a.cancellationPolicy
      ? [{ id: 'b07', type: 'text' as const, props: { variant: 'callout' as const, html: `<p><strong>Cancellation policy:</strong> ${a.cancellationPolicy}</p>` } }]
      : []),
    { id: 'b08', type: 'sign',       props: { providers: ['digio', 'docusign'], title: 'Ready to confirm?' } },
  ];
}

async function generateContractTemplate(a: OnboardingAnswers, ctx: BusinessContext): Promise<Draft['contractTemplate']> {
  const ai = client();
  if (!ai) return fallbackContractTemplate(a, ctx);
  const resp = await ai.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: `You draft service agreements for Indian service businesses. Output JSON ONLY:
{
  "name": "<short template name>",
  "bodyHtml": "<HTML agreement body>"
}
Use merge fields {{clientName}} {{vendorName}} {{businessName}} {{total}} {{eventDate}} {{date}} {{projectName}}.
Sections: 1) Services, 2) Fees & Payment, 3) Cancellation (use the business's stated policy), 4) Liability, 5) Acceptance. Use H1/H2/P tags only, no styling. Keep clauses plain-English and India-compliant.`,
    messages: [
      { role: 'user', content: `Business: ${ctx.businessName} (${ctx.businessTypeName}).\nAnswers:\n${JSON.stringify(a, null, 2)}` },
    ],
  });
  const text = (resp.content[0] as { text: string }).text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return fallbackContractTemplate(a, ctx);
  return JSON.parse(m[0]) as Draft['contractTemplate'];
}

async function generateCatalog(a: OnboardingAnswers, ctx: BusinessContext): Promise<Draft['catalog']> {
  const ai = client();
  if (!ai) return null;
  const resp = await ai.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `Generate a starter catalog of 5-10 realistic line items for an Indian service business. Output JSON ONLY:
{
  "tableName": "<category, e.g. Packages / Services / Add-ons>",
  "rows": [{ "name": string, "description": string|null, "unitPrice": number, "unit": string }]
}
Prices in INR within the business's stated price range. Units like "package", "hour", "per head", "per day". Mix of base offerings + 2-3 upsells. Make names and descriptions specific to the business's signature offering and category — not generic.`,
    messages: [
      { role: 'user', content: `Business: ${ctx.businessName} (${ctx.businessTypeName}). Sale model: ${a.saleModel ?? 'PACKAGES'}.\nAnswers:\n${JSON.stringify(a, null, 2)}` },
    ],
  });
  const text = (resp.content[0] as { text: string }).text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  return JSON.parse(m[0]) as Draft['catalog'];
}

async function generateAIConfig(a: OnboardingAnswers, ctx: BusinessContext): Promise<Draft['aiConfig']> {
  return {
    tone: a.toneHint ?? 'warm',
    customInstructions: [
      a.signatureOffering ? `Always foreground: ${a.signatureOffering}.` : '',
      a.housePhrases?.length ? `House phrases to weave in: ${a.housePhrases.join(' · ')}.` : '',
      a.outOfScope ? `Out of scope (never propose): ${a.outOfScope}.` : '',
      a.cancellationPolicy ? `Cancellation policy: ${a.cancellationPolicy}.` : '',
    ].filter(Boolean).join('\n'),
    mandatoryItemSlugs: [],
  };
}

// ─── fallbacks (used when no API key, or generation fails) ────────────────────
function fallbackProposalTemplate(a: OnboardingAnswers, _ctx: BusinessContext): Draft['proposalTemplate'] {
  const out: Omit<Draft['proposalTemplate'], 'blocks'> = {
    coverHtml: DEFAULT_COVER_HTML,
    aboutHtml: DEFAULT_ABOUT_HTML,
    defaultIntro: 'Thanks for considering us — this proposal lays out the scope, pricing, and how the engagement is structured.',
    defaultInclusions: a.inclusions?.length ? a.inclusions : STARTER_INCLUSIONS,
    defaultTerms: STARTER_TERMS,
    defaultValidityDays: 14,
    defaultDepositPercent: a.standardDepositPercent ?? 25,
    accentColor: null,
    toneHint: a.toneHint ?? 'warm',
    housePhrases: a.housePhrases?.length ? a.housePhrases : STARTER_HOUSE_PHRASES,
  };
  return { ...out, blocks: deriveBlocksFromTemplate(out, a) };
}

function fallbackContractTemplate(_a: OnboardingAnswers, _ctx: BusinessContext): Draft['contractTemplate'] {
  return { name: 'Standard service agreement', bodyHtml: DEFAULT_CONTRACT_HTML };
}

function fallbackAIConfig(a: OnboardingAnswers): Draft['aiConfig'] {
  return { tone: a.toneHint ?? 'warm', customInstructions: '', mandatoryItemSlugs: [] };
}

// ─── 4. applyDraft — writes the accepted subset to DB ─────────────────────────
export interface AcceptedFlags {
  proposalTemplate?: boolean;
  contractTemplate?: boolean;
  catalog?: boolean;
  aiConfig?: boolean;
}

export async function applyDraft(tenantId: string, draft: Draft, accepted: AcceptedFlags): Promise<{ applied: string[] }> {
  const applied: string[] = [];

  await prisma.$transaction(async (tx) => {
    // 1. Proposal template — write as a NEW template tagged "AI onboarding" and mark default.
    if (accepted.proposalTemplate) {
      const p = draft.proposalTemplate;
      await tx.proposalTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } });
      await tx.proposalTemplate.create({
        data: {
          tenantId,
          name: 'AI-generated proposal template',
          description: 'Built from your onboarding answers. Edit anytime under Settings → Proposal templates.',
          coverHtml: p.coverHtml,
          aboutHtml: p.aboutHtml,
          defaultIntro: p.defaultIntro,
          defaultInclusions: p.defaultInclusions as object,
          defaultTerms: p.defaultTerms as object,
          defaultValidityDays: p.defaultValidityDays,
          defaultDepositPercent: p.defaultDepositPercent,
          accentColor: p.accentColor,
          toneHint: p.toneHint,
          housePhrases: p.housePhrases as object,
          sectionOrder: DEFAULT_SECTION_ORDER as object,
          // New: block-builder shape. The Phase 2 builder UI edits this column.
          blocks: (p.blocks ?? []) as object,
          isDefault: true,
        },
      });
      applied.push('proposalTemplate');
    }

    // 2. Contract template — same pattern.
    if (accepted.contractTemplate) {
      await tx.contractTemplate.updateMany({ where: { tenantId }, data: { isDefault: false } });
      await tx.contractTemplate.create({
        data: {
          tenantId,
          name: draft.contractTemplate.name || 'AI-generated agreement',
          bodyHtml: draft.contractTemplate.bodyHtml,
          isDefault: true,
        },
      });
      applied.push('contractTemplate');
    }

    // 3. Catalog seed — add a CustomTable + CustomRows.
    if (accepted.catalog && draft.catalog) {
      const slug = draft.catalog.tableName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 6);
      const table = await tx.customTable.create({
        data: {
          tenantId,
          slug,
          name: draft.catalog.tableName,
        },
      });
      for (const r of draft.catalog.rows) {
        await tx.customRow.create({
          data: {
            tableId: table.id,
            data: {
              name: r.name,
              description: r.description ?? '',
              unitPrice: r.unitPrice,
              unit: r.unit,
            } as object,
          },
        });
      }
      applied.push('catalog');
    }

    // 4. Tenant AI config — upsert.
    if (accepted.aiConfig) {
      await tx.tenantAIConfig.upsert({
        where: { tenantId },
        create: {
          tenantId,
          tone: draft.aiConfig.tone,
          customInstructions: draft.aiConfig.customInstructions,
          mandatoryItemSlugs: draft.aiConfig.mandatoryItemSlugs as object,
        },
        update: {
          tone: draft.aiConfig.tone,
          customInstructions: draft.aiConfig.customInstructions,
          mandatoryItemSlugs: draft.aiConfig.mandatoryItemSlugs as object,
        },
      });
      applied.push('aiConfig');
    }

    // Mark onboarding completed.
    await tx.tenant.update({
      where: { id: tenantId },
      data: { onboardingCompletedAt: new Date() },
    });
  });

  return { applied };
}
