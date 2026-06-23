/**
 * Three starter ProposalTemplate shapes — each a different sales motion, not
 * just different copy. Vendor picks one when creating a new template; the
 * builder UI (Phase 2) lets them edit any block afterward.
 *
 *   1. Classic Service       — most service vendors. Trust + thoroughness.
 *   2. Visual Showcase       — photographers, designers, event planners.
 *   3. One-pager Quick Quote — high-volume, small-ticket. Close fast.
 *
 * Each export is the `blocks` array to seed into ProposalTemplate.blocks.
 * The companion meta (name, description, defaults) is on the BLOCK_LIBRARY-
 * adjacent STARTER_TEMPLATES list at the bottom.
 */
import type { Block } from './blocks';

// nanoid-style stable IDs. Real new templates get fresh nanoid()s on clone.
const id = (i: number) => `b${i.toString().padStart(2, '0')}`;

// ─── 1. Classic Service ───────────────────────────────────────────────────────
export const classicServiceBlocks: Block[] = [
  {
    id: id(1),
    type: 'cover',
    props: {
      title: 'Proposal for {{clientName}}',
      subtitle: 'Prepared by {{vendorName}}',
      kicker: '{{date}}',
    },
  },
  {
    id: id(2),
    type: 'about',
    props: {
      html: '<p>Thanks for the chat — this proposal captures the scope, pricing, and how we deliver. Everything you need to make a clean decision is in here.</p>',
      showLogo: true,
    },
  },
  { id: id(3), type: 'services', props: { layout: 'detailed' } },
  { id: id(4), type: 'pricing', props: { layout: 'breakdown', showTaxBreakdown: true } },
  {
    id: id(5),
    type: 'inclusions',
    props: {
      title: "What's included",
      items: [
        'GST and all statutory taxes',
        'Pre-event coordination + walkthrough',
        'On-site team for setup and teardown',
        'One round of revisions',
      ],
    },
  },
  {
    id: id(6),
    type: 'terms',
    props: {
      title: 'Terms',
      items: [
        '50% advance is required to confirm the booking.',
        'Balance is due before delivery.',
        'Cancellations within 30 days of the event date may incur the full fee.',
        'Quote is valid for 14 days from the date issued.',
      ],
    },
  },
  { id: id(7), type: 'sign', props: { providers: ['digio', 'docusign'], title: 'Ready to confirm?' } },
];

// ─── 2. Visual Showcase ───────────────────────────────────────────────────────
export const visualShowcaseBlocks: Block[] = [
  {
    id: id(1),
    type: 'cover',
    props: {
      title: '{{clientName}}',
      subtitle: 'A proposal from {{vendorName}}',
      kicker: '{{date}}',
      imageUrl: null, // builder UI lets vendor pick from their gallery
    },
  },
  { id: id(2), type: 'gallery', props: { layout: 'mosaic', maxItems: 5 } },
  {
    id: id(3),
    type: 'text',
    props: {
      html: '<p>A short intro to our approach goes here. We pick light, mood, and pace to match the moment — every shoot is custom.</p>',
      variant: 'normal',
    },
  },
  { id: id(4), type: 'services', props: { layout: 'detailed', showItemImages: true } },
  { id: id(5), type: 'pricing', props: { layout: 'breakdown', showTaxBreakdown: true } },
  {
    id: id(6),
    type: 'quote',
    props: {
      text: '"They captured every moment without ever being in the way. The album is everything we hoped for."',
      author: 'A recent client',
    },
  },
  {
    id: id(7),
    type: 'inclusions',
    props: {
      title: "What's included",
      items: [
        'High-resolution edited deliverables',
        'Online private gallery for sharing',
        'GST included in pricing',
        'Two rounds of selections / revisions',
      ],
    },
  },
  {
    id: id(8),
    type: 'terms',
    props: {
      title: 'Terms',
      items: [
        '30% retainer locks the date in our calendar.',
        'Balance is due one week before the event.',
        'Raw files remain ours; you receive the polished edits.',
        'Quote is valid for 14 days.',
      ],
    },
  },
  { id: id(9), type: 'sign', props: { providers: ['digio', 'docusign'], title: 'Lock it in' } },
];

// ─── 3. One-pager Quick Quote ─────────────────────────────────────────────────
export const onePagerBlocks: Block[] = [
  {
    id: id(1),
    type: 'cover',
    props: {
      title: 'Quote for {{clientName}}',
      subtitle: 'From {{vendorName}} · valid 14 days',
    },
  },
  { id: id(2), type: 'services', props: { layout: 'compact' } },
  { id: id(3), type: 'pricing', props: { layout: 'summary' } },
  {
    id: id(4),
    type: 'text',
    props: {
      variant: 'callout',
      html: '<p><strong>Pay 50% now</strong> to lock the slot. The remaining 50% is due before delivery. GST is already included above.</p>',
    },
  },
  { id: id(5), type: 'sign', props: { providers: ['digio', 'docusign'], title: 'Confirm this quote' } },
];

// ─── catalog metadata for the "New template" picker UI ────────────────────────
export interface StarterMeta {
  key: 'classic' | 'visual' | 'one-pager' | 'blank';
  name: string;
  description: string;
  goodFor: string;
  blocks: Block[] | null;
  defaultIntro: string;
  defaultValidityDays: number;
  defaultDepositPercent: number;
  toneHint: 'warm' | 'formal' | 'concise' | 'playful';
}

export const STARTER_TEMPLATES: StarterMeta[] = [
  {
    key: 'classic',
    name: 'Classic Service',
    description: 'Clean, thorough, professional. The most common shape for service businesses.',
    goodFor: 'Consultants, agencies, caterers, planners — anyone selling a scope-based service.',
    blocks: classicServiceBlocks,
    defaultIntro: 'Thanks for considering us. This proposal lays out exactly what you get and how it works.',
    defaultValidityDays: 14,
    defaultDepositPercent: 50,
    toneHint: 'warm',
  },
  {
    key: 'visual',
    name: 'Visual Showcase',
    description: 'Image-first proposal that lets the work do the talking. Gallery up top, services after.',
    goodFor: 'Photographers, videographers, designers, decorators, event planners.',
    blocks: visualShowcaseBlocks,
    defaultIntro: 'Here\'s the plan we put together for you, with a feel for our work up top.',
    defaultValidityDays: 14,
    defaultDepositPercent: 30,
    toneHint: 'warm',
  },
  {
    key: 'one-pager',
    name: 'One-pager Quick Quote',
    description: 'One screen, one price, one button. For small bookings that should close in a day.',
    goodFor: 'Tutors, fitness trainers, small-ticket service providers, repeat-customer scenarios.',
    blocks: onePagerBlocks,
    defaultIntro: 'Quick quote for you.',
    defaultValidityDays: 14,
    defaultDepositPercent: 50,
    toneHint: 'concise',
  },
  {
    key: 'blank',
    name: 'Start blank',
    description: 'Empty canvas. Drag in whatever blocks you want.',
    goodFor: 'Power users who want full control.',
    blocks: [],
    defaultIntro: '',
    defaultValidityDays: 14,
    defaultDepositPercent: 25,
    toneHint: 'warm',
  },
];
