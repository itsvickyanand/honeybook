/**
 * Pure proposal-template helpers — NO server imports, safe for client bundles
 * (proposal editor, settings preview pane). Same merge-field vocabulary as
 * Contracts so vendors learn it once.
 */

export const MERGE_FIELDS = [
  '{{clientName}}', '{{vendorName}}', '{{businessName}}',
  '{{projectName}}', '{{total}}', '{{eventDate}}', '{{date}}',
];

export interface ProposalVars {
  clientName?: string | null;
  vendorName?: string | null;
  businessName?: string | null;
  projectName?: string | null;
  total?: string | null;
  eventDate?: string | null;
  date?: string | null;
}

export function renderTemplate(bodyHtml: string, vars: ProposalVars): string {
  const map: Record<string, string> = {
    clientName: vars.clientName ?? '',
    vendorName: vars.vendorName ?? '',
    businessName: vars.businessName ?? '',
    projectName: vars.projectName ?? '',
    total: vars.total ?? '',
    eventDate: vars.eventDate ?? '',
    date: vars.date ?? new Date().toLocaleDateString('en-IN'),
  };
  return bodyHtml.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => map[k] ?? '');
}

export const TONE_HINTS = ['warm', 'formal', 'concise', 'playful'] as const;
export type Tone = typeof TONE_HINTS[number];

export const SECTION_KEYS = [
  'cover', 'about', 'sections', 'inclusions', 'terms', 'cta',
] as const;
export type SectionKey = typeof SECTION_KEYS[number];

export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'cover', 'about', 'sections', 'inclusions', 'terms', 'cta',
];

/** Sensible starter HTML for a brand-new template (vendor will customize). */
export const DEFAULT_COVER_HTML = `<h1>Proposal for {{clientName}}</h1>
<p>From <strong>{{businessName}}</strong> · {{date}}</p>
<p>{{projectName}} — prepared with care.</p>`;

export const DEFAULT_ABOUT_HTML = `<h2>About us</h2>
<p>We help our clients pull off events that look effortless. From the first conversation to the final handover, the goal is to take the planning weight off your shoulders.</p>`;

/** Default inclusions / terms by tone — used when a tenant has no custom values. */
export const STARTER_INCLUSIONS = [
  'Coordination and on-site management',
  'Setup and teardown',
  'Pre-event walkthrough',
];

export const STARTER_TERMS = [
  '50% retainer required to confirm the booking. Balance due before delivery.',
  'Retainer is non-refundable.',
  'Cancellations within 30 days of the event date may incur the full fee.',
  'Quote is valid for 14 days.',
];

export const STARTER_HOUSE_PHRASES = [
  'every detail accounted for',
  'on-the-day, you focus on the moment',
];

/** Wrap rendered inner HTML in a print-ready proposal document. */
export function proposalDocument(innerHtml: string, opts: {
  title?: string;
  accentColor?: string | null;
  coverImageUrl?: string | null;
} = {}): string {
  const accent = opts.accentColor || '#8b5cf6';
  const cover = opts.coverImageUrl
    ? `<div class="cover-img" style="background-image:url('${opts.coverImageUrl}')"></div>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${opts.title ?? 'Proposal'}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#14141d;max-width:820px;margin:0 auto;padding:0 24px 48px;line-height:1.6}
  h1{font-size:28px;margin:24px 0 8px;color:${accent}} h2{font-size:18px;margin-top:32px;color:${accent}}
  p{font-size:13px} strong{color:#000}
  .cover-img{height:220px;border-radius:16px;background-size:cover;background-position:center;margin:24px 0}
  .accent{color:${accent}}
  .section{padding:8px 0 4px;border-top:1px solid #eee}
  ul{font-size:13px} li{margin:4px 0}
  table{width:100%;font-size:13px;border-collapse:collapse;margin:8px 0}
  th,td{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}
  th{font-weight:600;color:#555}
</style></head><body>
${cover}
${innerHtml}
</body></html>`;
}
