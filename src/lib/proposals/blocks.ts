/**
 * Block-builder schema for proposal templates.
 *
 * A template's `blocks` column is a JSON array of these blocks. Each block has:
 *   - id     stable nanoid (used by the dnd-kit sortable + React keys)
 *   - type   discriminator
 *   - props  type-specific payload
 *
 * Server- and client-safe — no Node imports. Used by:
 *   - lib/proposals/blocks-render.ts (renderer → HTML)
 *   - lib/ai/onboarding.ts (AI emits this shape)
 *   - lib/proposals/starter-templates.ts (the 3 starter shapes)
 *   - the future builder UI (Phase 2)
 *
 * Adding a new block type:
 *   1. Add a new variant to the `Block` discriminated union below.
 *   2. Add a Zod schema variant in `blockSchema`.
 *   3. Add a renderer case in lib/proposals/blocks-render.ts.
 *   4. Add a palette entry in BLOCK_LIBRARY for the builder UI.
 */
import { z } from 'zod';

// ─── individual block prop shapes ─────────────────────────────────────────────
export interface CoverProps {
  /** Big headline. Supports merge fields. Defaults to "Proposal for {{clientName}}". */
  title: string;
  /** Smaller subtitle — usually the vendor name. */
  subtitle?: string;
  /** Optional hero image URL (R2). When set, overlays the accent color. */
  imageUrl?: string | null;
  /** Optional kicker line above the title — e.g. "Curated by {{vendorName}}". */
  kicker?: string;
}

export interface TextProps {
  /** Rich-text HTML. Sanitized at render. Supports merge fields. */
  html: string;
  /** Visual emphasis: 'normal' | 'callout' (boxed). */
  variant?: 'normal' | 'callout';
}

export interface AboutProps {
  /** Rich-text HTML for the about-us blurb. */
  html: string;
  /** Show the tenant's logo above the text? */
  showLogo?: boolean;
}

/** "Services" pulls dynamically from the ProposalDoc.sections at render time —
 * the block itself carries only presentation hints. */
export interface ServicesProps {
  layout?: 'detailed' | 'compact';
  showItemImages?: boolean;
}

export interface PricingProps {
  /** Show line-item totals vs. just the final number. */
  layout?: 'breakdown' | 'summary';
  /** Show GST / tax breakdown? */
  showTaxBreakdown?: boolean;
}

export interface InclusionsProps {
  /** Static list shown in the rendered proposal. AI may extend on generate. */
  items: string[];
  /** Title shown above the list. */
  title?: string;
}

export interface TermsProps {
  items: string[];
  title?: string;
}

export interface GalleryProps {
  /** Pick which Gallery row to render. If null, AI picks the most recent. */
  galleryId?: string | null;
  layout?: 'grid' | 'carousel' | 'mosaic';
  /** Cap visible items so the proposal doesn't sprawl. */
  maxItems?: number;
}

export interface QuoteProps {
  /** The pull-quote text. */
  text: string;
  /** Who said it. */
  author?: string;
  /** Optional author role / company. */
  authorRole?: string;
}

export interface SignProps {
  /** Which providers the client can choose. Empty = both. */
  providers?: ('digio' | 'docusign')[];
  /** Headline above the sign buttons. */
  title?: string;
}

export interface VideoProps {
  /** Full embed URL (YouTube, Vimeo, Loom). We render an <iframe>. */
  url: string;
  /** Caption shown below the video. */
  caption?: string;
}

export interface CalendarBookingProps {
  /** Slug of a MeetingType — embeds the public booking page in an iframe. */
  meetingTypeSlug?: string | null;
  /** Title shown above the embed. */
  title?: string;
}

export interface FaqProps {
  items: { q: string; a: string }[];
  title?: string;
}

export interface PaymentScheduleProps {
  /** Show actual milestones from PaymentSchedule, or a hypothetical from
   *  defaultDepositPercent if no schedule exists yet. */
  fallbackToDeposit?: boolean;
  title?: string;
}

// ─── discriminated union ──────────────────────────────────────────────────────
export type BlockType =
  | 'cover' | 'text' | 'about'
  | 'services' | 'pricing'
  | 'inclusions' | 'terms'
  | 'gallery' | 'quote' | 'sign'
  | 'video' | 'calendar-booking' | 'faq' | 'payment-schedule';

export type Block =
  | { id: string; type: 'cover';            props: CoverProps }
  | { id: string; type: 'text';             props: TextProps }
  | { id: string; type: 'about';            props: AboutProps }
  | { id: string; type: 'services';         props: ServicesProps }
  | { id: string; type: 'pricing';          props: PricingProps }
  | { id: string; type: 'inclusions';       props: InclusionsProps }
  | { id: string; type: 'terms';            props: TermsProps }
  | { id: string; type: 'gallery';          props: GalleryProps }
  | { id: string; type: 'quote';            props: QuoteProps }
  | { id: string; type: 'sign';             props: SignProps }
  | { id: string; type: 'video';            props: VideoProps }
  | { id: string; type: 'calendar-booking'; props: CalendarBookingProps }
  | { id: string; type: 'faq';              props: FaqProps }
  | { id: string; type: 'payment-schedule'; props: PaymentScheduleProps };

// ─── Zod runtime validation ───────────────────────────────────────────────────
const coverSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  kicker: z.string().optional(),
});
const textSchema = z.object({
  html: z.string(),
  variant: z.enum(['normal', 'callout']).optional(),
});
const aboutSchema = z.object({
  html: z.string(),
  showLogo: z.boolean().optional(),
});
const servicesSchema = z.object({
  layout: z.enum(['detailed', 'compact']).optional(),
  showItemImages: z.boolean().optional(),
});
const pricingSchema = z.object({
  layout: z.enum(['breakdown', 'summary']).optional(),
  showTaxBreakdown: z.boolean().optional(),
});
const inclusionsSchema = z.object({
  items: z.array(z.string()),
  title: z.string().optional(),
});
const termsSchema = z.object({
  items: z.array(z.string()),
  title: z.string().optional(),
});
const gallerySchema = z.object({
  galleryId: z.string().nullable().optional(),
  layout: z.enum(['grid', 'carousel', 'mosaic']).optional(),
  maxItems: z.number().int().positive().optional(),
});
const quoteSchema = z.object({
  text: z.string(),
  author: z.string().optional(),
  authorRole: z.string().optional(),
});
const signSchema = z.object({
  providers: z.array(z.enum(['digio', 'docusign'])).optional(),
  title: z.string().optional(),
});
const videoSchema = z.object({
  url: z.string().url(),
  caption: z.string().optional(),
});
const calendarBookingSchema = z.object({
  meetingTypeSlug: z.string().nullable().optional(),
  title: z.string().optional(),
});
const faqSchema = z.object({
  items: z.array(z.object({ q: z.string(), a: z.string() })),
  title: z.string().optional(),
});
const paymentScheduleSchema = z.object({
  fallbackToDeposit: z.boolean().optional(),
  title: z.string().optional(),
});

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string(), type: z.literal('cover'),            props: coverSchema }),
  z.object({ id: z.string(), type: z.literal('text'),             props: textSchema }),
  z.object({ id: z.string(), type: z.literal('about'),            props: aboutSchema }),
  z.object({ id: z.string(), type: z.literal('services'),         props: servicesSchema }),
  z.object({ id: z.string(), type: z.literal('pricing'),          props: pricingSchema }),
  z.object({ id: z.string(), type: z.literal('inclusions'),       props: inclusionsSchema }),
  z.object({ id: z.string(), type: z.literal('terms'),            props: termsSchema }),
  z.object({ id: z.string(), type: z.literal('gallery'),          props: gallerySchema }),
  z.object({ id: z.string(), type: z.literal('quote'),            props: quoteSchema }),
  z.object({ id: z.string(), type: z.literal('sign'),             props: signSchema }),
  z.object({ id: z.string(), type: z.literal('video'),            props: videoSchema }),
  z.object({ id: z.string(), type: z.literal('calendar-booking'), props: calendarBookingSchema }),
  z.object({ id: z.string(), type: z.literal('faq'),              props: faqSchema }),
  z.object({ id: z.string(), type: z.literal('payment-schedule'), props: paymentScheduleSchema }),
]);

export const blocksSchema = z.array(blockSchema);

/** Safe parse — returns null on bad data instead of throwing. Use in renderer. */
export function parseBlocks(input: unknown): Block[] | null {
  const r = blocksSchema.safeParse(input);
  return r.success ? (r.data as Block[]) : null;
}

// ─── builder palette metadata ─────────────────────────────────────────────────
/** Used by the future Phase 2 builder UI to render the sidebar palette. */
export const BLOCK_LIBRARY: {
  type: BlockType;
  label: string;
  description: string;
  category: 'header' | 'content' | 'services' | 'social' | 'action' | 'media';
  defaultProps: () => Block['props'];
}[] = [
  { type: 'cover', label: 'Cover', description: 'Hero header with title + optional image', category: 'header',
    defaultProps: () => ({ title: 'Proposal for {{clientName}}', subtitle: '{{vendorName}}' }) },
  { type: 'text', label: 'Text', description: 'Rich-text paragraph', category: 'content',
    defaultProps: () => ({ html: '<p>Write here…</p>' }) },
  { type: 'about', label: 'About us', description: 'Vendor introduction', category: 'content',
    defaultProps: () => ({ html: '<p>We help our clients…</p>', showLogo: true }) },
  { type: 'services', label: 'Services', description: 'Auto-populated from the proposal', category: 'services',
    defaultProps: () => ({ layout: 'detailed' }) },
  { type: 'pricing', label: 'Pricing', description: 'Total + breakdown', category: 'services',
    defaultProps: () => ({ layout: 'breakdown', showTaxBreakdown: true }) },
  { type: 'inclusions', label: 'Inclusions', description: 'Checkmark list of what\'s included', category: 'content',
    defaultProps: () => ({ items: ['GST included', 'Setup + teardown'], title: 'What\'s included' }) },
  { type: 'terms', label: 'Terms', description: 'Bulleted terms list', category: 'content',
    defaultProps: () => ({ items: ['50% advance to confirm', 'Balance before delivery'], title: 'Terms' }) },
  { type: 'gallery', label: 'Gallery', description: 'Image grid from your portfolio', category: 'media',
    defaultProps: () => ({ layout: 'grid', maxItems: 6 }) },
  { type: 'quote', label: 'Testimonial', description: 'Client pull-quote', category: 'social',
    defaultProps: () => ({ text: '"They made it look effortless."', author: 'Happy client' }) },
  { type: 'sign', label: 'Sign', description: 'Embedded sign buttons (Aadhaar / DocuSign)', category: 'action',
    defaultProps: () => ({ providers: ['digio', 'docusign'], title: 'Ready to confirm?' }) },
  { type: 'video', label: 'Video', description: 'YouTube / Vimeo / Loom embed', category: 'media',
    defaultProps: () => ({ url: 'https://www.youtube.com/embed/dQw4w9WgXcQ' }) },
  { type: 'calendar-booking', label: 'Book a call', description: 'Embed a meeting type for the client to schedule', category: 'action',
    defaultProps: () => ({ title: 'Book a kickoff call' }) },
  { type: 'faq', label: 'FAQ', description: 'Accordion of questions + answers', category: 'content',
    defaultProps: () => ({ items: [{ q: 'How long does it take?', a: '…' }], title: 'Frequently asked' }) },
  { type: 'payment-schedule', label: 'Payment schedule', description: 'Milestones + due dates', category: 'services',
    defaultProps: () => ({ fallbackToDeposit: true, title: 'Payment schedule' }) },
];
