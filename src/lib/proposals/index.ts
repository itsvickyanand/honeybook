/**
 * Server-side proposal-template helpers (prisma). Pure render helpers live in
 * ./render (client-safe). Re-exported here so server callers have one import.
 */
import { prisma } from '../db';
import {
  DEFAULT_COVER_HTML, DEFAULT_ABOUT_HTML, DEFAULT_SECTION_ORDER,
  STARTER_INCLUSIONS, STARTER_TERMS, STARTER_HOUSE_PHRASES,
  type Tone,
} from './render';

export {
  MERGE_FIELDS, renderTemplate, proposalDocument,
  DEFAULT_COVER_HTML, DEFAULT_ABOUT_HTML, DEFAULT_SECTION_ORDER,
  STARTER_INCLUSIONS, STARTER_TERMS, STARTER_HOUSE_PHRASES,
  type ProposalVars, type Tone, type SectionKey,
} from './render';

/** Per-business-type starter template. Tuned tone + inclusions + terms. */
interface BusinessTypeStarter {
  name: string;
  description: string;
  toneHint: Tone;
  housePhrases: string[];
  defaultInclusions: string[];
  defaultTerms: string[];
  defaultValidityDays: number;
  defaultDepositPercent: number;
  coverHtml: string;
  aboutHtml: string;
  defaultIntro: string;
}

const PER_BUSINESS_TYPE: Record<string, BusinessTypeStarter> = {
  catering: {
    name: 'Standard catering proposal',
    description: 'Warm, food-forward tone with GST + service charges itemised.',
    toneHint: 'warm',
    housePhrases: ['fresh seasonal sourcing', 'on-time service, every cover plated'],
    defaultInclusions: [
      'Menu tasting before the event',
      'Setup, service crew and teardown',
      'GST as per applicable slab',
      'Crockery, cutlery and serving stations',
    ],
    defaultTerms: [
      '50% retainer confirms the booking. Balance is due 7 days before the event.',
      'Final headcount is locked 5 days prior; reductions beyond 10% may incur a flat fee.',
      'Cancellations within 14 days of the event date may incur up to the full fee.',
      'Quote is valid for 14 days.',
    ],
    defaultValidityDays: 14,
    defaultDepositPercent: 50,
    coverHtml: `<h1>Catering proposal for {{clientName}}</h1>
<p class="accent">{{businessName}} · {{date}}</p>
<p>Thank you for considering us for <strong>{{projectName}}</strong>. We've put together a menu and crew plan tailored to your event.</p>`,
    aboutHtml: `<h2>About us</h2>
<p>We're a hospitality team that obsesses about timing, temperature and small touches. Every cover gets the same attention as the first.</p>`,
    defaultIntro: 'Thank you for letting us cook for your guests. Our crew comes in early, sets up cleanly and stays till the last plate is cleared.',
  },
  'wedding-photography': {
    name: 'Wedding photography proposal',
    description: 'Editorial, calm tone with clear deliverable timeline.',
    toneHint: 'warm',
    housePhrases: ['quiet documentary style', 'edits delivered on a clear timeline'],
    defaultInclusions: [
      'Pre-wedding consult to align on shot priorities',
      'Two photographers covering parallel events',
      'High-resolution edited images delivered within 6 weeks',
      'Private online gallery for download and sharing',
    ],
    defaultTerms: [
      '40% retainer to confirm dates.',
      'Travel and accommodation outside the city are billed at actuals.',
      'RAW files are not delivered; high-resolution JPEGs are.',
      'Quote is valid for 14 days.',
    ],
    defaultValidityDays: 14,
    defaultDepositPercent: 40,
    coverHtml: `<h1>Photography for {{clientName}}</h1>
<p class="accent">{{businessName}} · {{date}}</p>
<p>We're honoured to be considered for <strong>{{projectName}}</strong>. Here's what your coverage looks like.</p>`,
    aboutHtml: `<h2>Our approach</h2>
<p>We work quietly. Less posing, more presence. The plan below covers the day end-to-end while staying out of your way.</p>`,
    defaultIntro: 'Our approach is documentary-first — we capture the day as it unfolds, with a few planned portraits where they work naturally.',
  },
  'wedding-planner': {
    name: 'End-to-end planning proposal',
    description: 'Milestone-heavy, formal tone for full-service planning.',
    toneHint: 'formal',
    housePhrases: ['end-to-end project management', 'every vendor coordinated under one plan'],
    defaultInclusions: [
      'Dedicated planner + on-day coordinator',
      'Vendor sourcing, contracting and management',
      'Detailed run-sheet for every function',
      'On-day coordination for all events',
    ],
    defaultTerms: [
      '25% retainer confirms the engagement.',
      'Payment milestones at booking, 60 days out and 14 days out.',
      'Vendor payments are passed through at actuals.',
      'Quote is valid for 21 days.',
    ],
    defaultValidityDays: 21,
    defaultDepositPercent: 25,
    coverHtml: `<h1>Planning proposal for {{clientName}}</h1>
<p class="accent">{{businessName}} · {{date}}</p>
<p>End-to-end planning for <strong>{{projectName}}</strong>. Below is the scope, team and milestones we propose.</p>`,
    aboutHtml: `<h2>How we work</h2>
<p>A senior planner leads the engagement from day one. We bring the right vendors, manage them through a single point of contact, and run the on-day operation so you don't have to think about it.</p>`,
    defaultIntro: 'Below is a phased plan — discovery, vendor lock-in, run-sheet build and on-day operations — so you always know what we are working on.',
  },
  'florist-decor': {
    name: 'Florist & decor proposal',
    description: 'Visual-forward, playful tone with mood-board references.',
    toneHint: 'playful',
    housePhrases: ['seasonal, in-bloom palettes', 'crafted on-site for the freshest finish'],
    defaultInclusions: [
      'Mood-board and palette presentation',
      'On-site installation by our floral team',
      'Removal and disposal post-event',
      'Service charges + GST',
    ],
    defaultTerms: [
      '50% retainer to lock the date.',
      'Final palette confirmed 14 days before the event.',
      'Stem substitutions may apply based on seasonal availability.',
      'Quote is valid for 14 days.',
    ],
    defaultValidityDays: 14,
    defaultDepositPercent: 50,
    coverHtml: `<h1>Florals & decor for {{clientName}}</h1>
<p class="accent">{{businessName}} · {{date}}</p>
<p>A proposal for <strong>{{projectName}}</strong>, built around what's blooming and what you love.</p>`,
    aboutHtml: `<h2>Our approach</h2>
<p>We design with seasonal stems, sketch the install on a board, and craft it on-site so the day always looks fresh.</p>`,
    defaultIntro: 'Florals are the first thing your guests will notice. Below is a palette + install plan tuned to the season and the venue.',
  },
  'event-management': {
    name: 'Event management proposal',
    description: 'Crisp corporate tone, deliverables-focused.',
    toneHint: 'concise',
    housePhrases: ['delivered on brief, on time, on budget'],
    defaultInclusions: [
      'Project management + dedicated point of contact',
      'Vendor coordination and on-site supervision',
      'Run-of-show, BOH and FOH operations',
      'Post-event report with attendance and learnings',
    ],
    defaultTerms: [
      '30% advance to confirm; 40% one week before; balance on completion.',
      'Out-of-pocket expenses billed at actuals.',
      'Cancellations within 14 days will incur up to the full advance.',
      'Quote is valid for 21 days.',
    ],
    defaultValidityDays: 21,
    defaultDepositPercent: 30,
    coverHtml: `<h1>Event management — {{clientName}}</h1>
<p class="accent">{{businessName}} · {{date}}</p>
<p>Scope, team and deliverables for <strong>{{projectName}}</strong>.</p>`,
    aboutHtml: `<h2>About us</h2>
<p>We run events as projects — clear briefs, defined roles, run-of-show locked early, and a tight on-day operation.</p>`,
    defaultIntro: 'This proposal walks through the scope, the team you get, and the cost structure for the event.',
  },
};

/** Generic fallback when the tenant's business slug isn't in the map. */
const GENERIC: BusinessTypeStarter = {
  name: 'Standard proposal',
  description: 'A balanced default — customise the tone, inclusions and terms for your business.',
  toneHint: 'warm',
  housePhrases: STARTER_HOUSE_PHRASES,
  defaultInclusions: STARTER_INCLUSIONS,
  defaultTerms: STARTER_TERMS,
  defaultValidityDays: 14,
  defaultDepositPercent: 25,
  coverHtml: DEFAULT_COVER_HTML,
  aboutHtml: DEFAULT_ABOUT_HTML,
  defaultIntro: 'Thanks for considering us. This proposal lays out what we will deliver, what is included, and how the engagement is structured.',
};

/** Ensure the tenant has at least one (default) proposal template. */
export async function ensureDefaultProposalTemplate(tenantId: string) {
  const existing = await prisma.proposalTemplate.findFirst({
    where: { tenantId, archived: false, isDefault: true },
  });
  if (existing) return existing;
  const any = await prisma.proposalTemplate.findFirst({ where: { tenantId, archived: false } });
  if (any) return any;

  // Read the tenant's business-type slug and pick a starter.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { businessType: { select: { slug: true } } },
  });
  const starter = (tenant && PER_BUSINESS_TYPE[tenant.businessType.slug]) ?? GENERIC;

  return prisma.proposalTemplate.create({
    data: {
      tenantId,
      name: starter.name,
      description: starter.description,
      coverHtml: starter.coverHtml,
      aboutHtml: starter.aboutHtml,
      defaultIntro: starter.defaultIntro,
      defaultInclusions: starter.defaultInclusions as object,
      defaultTerms: starter.defaultTerms as object,
      defaultValidityDays: starter.defaultValidityDays,
      defaultDepositPercent: starter.defaultDepositPercent,
      toneHint: starter.toneHint,
      housePhrases: starter.housePhrases as object,
      sectionOrder: DEFAULT_SECTION_ORDER as object,
      isDefault: true,
    },
  });
}

/** Resolve the template a proposal should use: explicit → tenant default. */
export async function resolveProposalTemplate(tenantId: string, proposalTemplateId: string | null) {
  if (proposalTemplateId) {
    const t = await prisma.proposalTemplate.findFirst({ where: { id: proposalTemplateId, tenantId, archived: false } });
    if (t) return t;
  }
  return ensureDefaultProposalTemplate(tenantId);
}
