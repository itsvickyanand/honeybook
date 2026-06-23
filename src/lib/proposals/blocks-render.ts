/**
 * Blocks → HTML renderer.
 *
 * Pure function: takes a validated Block[] (from a ProposalTemplate) + a
 * render context (proposal data, brand, vendor, totals) and returns the inner
 * HTML to be wrapped by `proposalDocument()`.
 *
 * - Server- and client-safe (no Node imports beyond standard string ops).
 * - Each block type has its own pure renderer below.
 * - Merge fields ({{clientName}}, etc.) are substituted via existing renderTemplate.
 * - HTML strings inside blocks (text.html, about.html, faq.a) are NOT sanitized
 *   here — sanitization happens at write-time in the builder UI (Phase 2).
 *   Until then, vendors authoring blocks via the AI generator can be trusted
 *   (the AI emits clean HTML).
 */
import type { Block } from './blocks';
import type { ProposalDoc } from '../proposal-schema';
import { renderTemplate, type ProposalVars } from './render';

// ─── render context ───────────────────────────────────────────────────────────
export interface RenderContext {
  doc: ProposalDoc;
  vars: ProposalVars;
  /** Brand */
  accentColor: string;
  vendorLogoUrl: string | null;
  /** Pre-formatted total + breakdown for pricing block. */
  totals: {
    subTotal: string;
    discount: string;
    tax: string;
    total: string;
    taxLabel: string;
    taxRate: number;
  };
  /** Galleries the tenant has — used by the gallery block. */
  galleries: { id: string; title: string; thumbnailUrls: string[] }[];
  /** Payment schedule rows (project may not have one yet → empty array OK). */
  paymentSchedule: { label: string; dueDate: string | null; amount: string }[];
  /** Default deposit % from the template — used when schedule is empty. */
  defaultDepositPercent: number | null;
  /** App URL — used to build booking iframe sources. */
  appUrl: string;
  /** Locale-aware formatter for short dates. */
  formatShortDate: (d: Date | string) => string;
}

// ─── public API ───────────────────────────────────────────────────────────────
/** Render a full blocks array into the inner HTML of a proposal. */
export function renderBlocks(blocks: Block[], ctx: RenderContext): string {
  return blocks.map((b) => renderBlock(b, ctx)).join('\n');
}

/** Single-block renderer — exported for previewing in the builder. */
export function renderBlock(block: Block, ctx: RenderContext): string {
  switch (block.type) {
    case 'cover':            return renderCover(block.props, ctx);
    case 'text':             return renderText(block.props, ctx);
    case 'about':            return renderAbout(block.props, ctx);
    case 'services':         return renderServices(block.props, ctx);
    case 'pricing':          return renderPricing(block.props, ctx);
    case 'inclusions':       return renderInclusions(block.props, ctx);
    case 'terms':            return renderTerms(block.props, ctx);
    case 'gallery':          return renderGallery(block.props, ctx);
    case 'quote':            return renderQuote(block.props, ctx);
    case 'sign':             return renderSign(block.props, ctx);
    case 'video':            return renderVideo(block.props, ctx);
    case 'calendar-booking': return renderCalendarBooking(block.props, ctx);
    case 'faq':              return renderFaq(block.props, ctx);
    case 'payment-schedule': return renderPaymentSchedule(block.props, ctx);
    default: return '';
  }
}

// ─── individual renderers ─────────────────────────────────────────────────────
function merge(s: string, ctx: RenderContext): string {
  return renderTemplate(s, ctx.vars);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

function renderCover(p: import('./blocks').CoverProps, ctx: RenderContext): string {
  const title = merge(p.title, ctx);
  const subtitle = p.subtitle ? merge(p.subtitle, ctx) : '';
  const kicker = p.kicker ? merge(p.kicker, ctx) : '';
  const bg = p.imageUrl
    ? `background-image:linear-gradient(135deg,${ctx.accentColor}cc 0%,#0008 100%),url('${p.imageUrl}');background-size:cover;background-position:center;color:white;`
    : `background:linear-gradient(135deg,${ctx.accentColor} 0%,#1f2937 100%);color:white;`;
  return `
<section class="block-cover" style="${bg}padding:48px 32px;border-radius:18px;margin-bottom:24px;">
  ${kicker ? `<div style="opacity:0.85;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">${escapeHtml(kicker)}</div>` : ''}
  <h1 style="font-size:36px;line-height:1.15;margin:0 0 8px 0;font-weight:700;">${escapeHtml(title)}</h1>
  ${subtitle ? `<div style="font-size:18px;opacity:0.85;">${escapeHtml(subtitle)}</div>` : ''}
</section>`;
}

function renderText(p: import('./blocks').TextProps, ctx: RenderContext): string {
  const html = merge(p.html, ctx);
  if (p.variant === 'callout') {
    return `<section class="block-text" style="padding:20px;background:${ctx.accentColor}15;border-left:4px solid ${ctx.accentColor};border-radius:10px;margin:16px 0;">${html}</section>`;
  }
  return `<section class="block-text" style="padding:8px 0;margin:8px 0;">${html}</section>`;
}

function renderAbout(p: import('./blocks').AboutProps, ctx: RenderContext): string {
  const logo = p.showLogo && ctx.vendorLogoUrl
    ? `<img src="${ctx.vendorLogoUrl}" alt="Logo" style="height:40px;margin-bottom:16px;" />`
    : '';
  return `
<section class="block-about" style="padding:24px;background:#0001;border-radius:14px;margin:16px 0;">
  ${logo}
  ${merge(p.html, ctx)}
</section>`;
}

function renderServices(p: import('./blocks').ServicesProps, ctx: RenderContext): string {
  const compact = p.layout === 'compact';
  if (!ctx.doc.sections.length) return '';
  const sections = ctx.doc.sections.map((s) => {
    const items = s.items.map((it) => {
      const right = `<div style="text-align:right;white-space:nowrap;">${ctx.doc.currency === 'INR' ? '₹' : ctx.doc.currency} ${it.amount?.toFixed(0) ?? '0'}</div>`;
      if (compact) {
        return `<div style="display:flex;justify-content:space-between;gap:16px;padding:6px 0;border-bottom:1px solid #0001;"><div>${escapeHtml(it.name)} ${it.quantity > 1 ? `× ${it.quantity}` : ''}</div>${right}</div>`;
      }
      return `
<div style="display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid #0001;">
  <div>
    <div style="font-weight:600;">${escapeHtml(it.name)} ${it.quantity > 1 ? `<span style="opacity:0.6;">× ${it.quantity}</span>` : ''}</div>
    ${it.description ? `<div style="font-size:13px;opacity:0.75;margin-top:4px;">${escapeHtml(it.description)}</div>` : ''}
  </div>
  ${right}
</div>`;
    }).join('');
    return `
<div style="margin-bottom:24px;">
  <h3 style="font-size:18px;margin:0 0 4px 0;">${escapeHtml(s.title)}</h3>
  ${s.intro ? `<p style="opacity:0.75;margin:0 0 12px 0;">${escapeHtml(s.intro)}</p>` : ''}
  ${items}
</div>`;
  }).join('');
  return `<section class="block-services" style="padding:8px 0;margin:16px 0;">${sections}</section>`;
}

function renderPricing(p: import('./blocks').PricingProps, ctx: RenderContext): string {
  const { totals } = ctx;
  if (p.layout === 'summary') {
    return `
<section class="block-pricing" style="padding:24px;border:2px solid ${ctx.accentColor};border-radius:14px;margin:16px 0;text-align:right;">
  <div style="font-size:13px;opacity:0.7;text-transform:uppercase;letter-spacing:0.06em;">Total</div>
  <div style="font-size:32px;font-weight:700;color:${ctx.accentColor};">${escapeHtml(totals.total)}</div>
</section>`;
  }
  const rows = [
    `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>Sub-total</span><span>${escapeHtml(totals.subTotal)}</span></div>`,
    totals.discount !== ctx.doc.currency + ' 0' && parseFloat(totals.discount.replace(/[^\d.]/g, '')) > 0
      ? `<div style="display:flex;justify-content:space-between;padding:6px 0;opacity:0.75;"><span>Discount</span><span>− ${escapeHtml(totals.discount)}</span></div>`
      : '',
    p.showTaxBreakdown !== false
      ? `<div style="display:flex;justify-content:space-between;padding:6px 0;opacity:0.75;"><span>${escapeHtml(totals.taxLabel)} (${totals.taxRate}%)</span><span>${escapeHtml(totals.tax)}</span></div>`
      : '',
    `<div style="display:flex;justify-content:space-between;padding:12px 0 0 0;border-top:2px solid ${ctx.accentColor};margin-top:8px;"><span style="font-weight:700;">Total</span><span style="font-weight:700;color:${ctx.accentColor};font-size:18px;">${escapeHtml(totals.total)}</span></div>`,
  ].filter(Boolean).join('');
  return `
<section class="block-pricing" style="padding:24px;background:#0001;border-radius:14px;margin:16px 0;">
  ${rows}
</section>`;
}

function renderInclusions(p: import('./blocks').InclusionsProps, ctx: RenderContext): string {
  const items = (p.items.length ? p.items : ctx.doc.inclusions).map((it) =>
    `<li style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;"><span style="color:#10b981;font-weight:bold;">✓</span><span>${escapeHtml(merge(it, ctx))}</span></li>`,
  ).join('');
  if (!items) return '';
  return `
<section class="block-inclusions" style="padding:24px;background:#0001;border-radius:14px;margin:16px 0;">
  <h3 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(p.title ?? "What's included")}</h3>
  <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
</section>`;
}

function renderTerms(p: import('./blocks').TermsProps, ctx: RenderContext): string {
  const items = (p.items.length ? p.items : ctx.doc.terms).map((it) =>
    `<li style="padding:4px 0;opacity:0.85;">${escapeHtml(merge(it, ctx))}</li>`,
  ).join('');
  if (!items) return '';
  return `
<section class="block-terms" style="padding:24px;margin:16px 0;">
  <h3 style="margin:0 0 12px 0;font-size:16px;opacity:0.75;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(p.title ?? 'Terms')}</h3>
  <ul style="padding-left:20px;margin:0;font-size:14px;">${items}</ul>
</section>`;
}

function renderGallery(p: import('./blocks').GalleryProps, ctx: RenderContext): string {
  const gallery = p.galleryId
    ? ctx.galleries.find((g) => g.id === p.galleryId)
    : ctx.galleries[0];
  if (!gallery || !gallery.thumbnailUrls.length) return '';
  const max = p.maxItems ?? 6;
  const urls = gallery.thumbnailUrls.slice(0, max);
  const layout = p.layout ?? 'grid';
  const gridCss = layout === 'mosaic'
    ? 'grid-template-columns:2fr 1fr 1fr;grid-template-rows:auto auto;'
    : 'grid-template-columns:repeat(auto-fit,minmax(160px,1fr));';
  const items = urls.map((u, i) => {
    const span = layout === 'mosaic' && i === 0 ? 'grid-row:span 2;' : '';
    return `<div style="${span}aspect-ratio:1;background:url('${u}') center/cover no-repeat;border-radius:10px;"></div>`;
  }).join('');
  return `
<section class="block-gallery" style="padding:24px 0;margin:16px 0;">
  <h3 style="margin:0 0 16px 0;font-size:18px;">${escapeHtml(gallery.title || 'From our work')}</h3>
  <div style="display:grid;gap:12px;${gridCss}">${items}</div>
</section>`;
}

function renderQuote(p: import('./blocks').QuoteProps, ctx: RenderContext): string {
  return `
<section class="block-quote" style="padding:32px;border-left:4px solid ${ctx.accentColor};background:${ctx.accentColor}10;border-radius:0 14px 14px 0;margin:24px 0;">
  <div style="font-size:20px;line-height:1.5;font-style:italic;margin-bottom:12px;">${escapeHtml(merge(p.text, ctx))}</div>
  ${p.author ? `<div style="font-size:13px;opacity:0.75;">— ${escapeHtml(p.author)}${p.authorRole ? `, ${escapeHtml(p.authorRole)}` : ''}</div>` : ''}
</section>`;
}

function renderSign(p: import('./blocks').SignProps, _ctx: RenderContext): string {
  // The actual sign buttons are interactive — they live on the client portal
  // shell, not in this static HTML. We render a placeholder anchor so the
  // portal client component can hydrate over it / scroll to it.
  return `
<section class="block-sign" data-block-sign="1" data-providers="${(p.providers ?? ['digio', 'docusign']).join(',')}" style="padding:32px;text-align:center;margin:24px 0;border:1px dashed #0003;border-radius:14px;">
  <h3 style="margin:0 0 8px 0;">${escapeHtml(p.title ?? 'Ready to confirm?')}</h3>
  <p style="opacity:0.65;margin:0;font-size:14px;">Use the sign button at the bottom of this proposal.</p>
</section>`;
}

function renderVideo(p: import('./blocks').VideoProps, _ctx: RenderContext): string {
  return `
<section class="block-video" style="margin:16px 0;">
  <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:14px;">
    <iframe src="${escapeHtml(p.url)}" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>
  </div>
  ${p.caption ? `<div style="text-align:center;font-size:13px;opacity:0.7;margin-top:8px;">${escapeHtml(p.caption)}</div>` : ''}
</section>`;
}

function renderCalendarBooking(p: import('./blocks').CalendarBookingProps, ctx: RenderContext): string {
  if (!p.meetingTypeSlug) {
    return `
<section class="block-calendar-booking" style="padding:24px;background:${ctx.accentColor}10;border-radius:14px;margin:16px 0;text-align:center;">
  <h3 style="margin:0 0 8px 0;">${escapeHtml(p.title ?? 'Book a call')}</h3>
  <p style="opacity:0.65;margin:0;font-size:14px;">Booking will appear here once a meeting type is selected.</p>
</section>`;
  }
  const url = `${ctx.appUrl}/book/${encodeURIComponent(p.meetingTypeSlug)}?embed=1`;
  return `
<section class="block-calendar-booking" style="margin:16px 0;">
  ${p.title ? `<h3 style="margin:0 0 12px 0;">${escapeHtml(p.title)}</h3>` : ''}
  <iframe src="${url}" style="width:100%;min-height:520px;border:1px solid #0001;border-radius:14px;" loading="lazy"></iframe>
</section>`;
}

function renderFaq(p: import('./blocks').FaqProps, ctx: RenderContext): string {
  if (!p.items.length) return '';
  const items = p.items.map((it) => `
<details style="border-bottom:1px solid #0001;padding:14px 0;">
  <summary style="cursor:pointer;font-weight:600;list-style:none;">${escapeHtml(merge(it.q, ctx))}</summary>
  <div style="padding-top:8px;opacity:0.8;font-size:14px;">${merge(it.a, ctx)}</div>
</details>`).join('');
  return `
<section class="block-faq" style="padding:24px;background:#0001;border-radius:14px;margin:16px 0;">
  <h3 style="margin:0 0 8px 0;font-size:18px;">${escapeHtml(p.title ?? 'Frequently asked')}</h3>
  ${items}
</section>`;
}

function renderPaymentSchedule(p: import('./blocks').PaymentScheduleProps, ctx: RenderContext): string {
  let rows = ctx.paymentSchedule;
  if (!rows.length && p.fallbackToDeposit !== false && ctx.defaultDepositPercent && ctx.defaultDepositPercent > 0) {
    const deposit = ctx.defaultDepositPercent;
    rows = [
      { label: `Advance (${deposit}%)`, dueDate: 'On signing', amount: '' },
      { label: `Balance (${100 - deposit}%)`, dueDate: 'Before delivery', amount: '' },
    ];
  }
  if (!rows.length) return '';
  const tableRows = rows.map((r) => `
<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #0001;">${escapeHtml(r.label)}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #0001;opacity:0.75;font-size:14px;">${escapeHtml(r.dueDate ?? '—')}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #0001;text-align:right;font-weight:600;">${escapeHtml(r.amount)}</td>
</tr>`).join('');
  return `
<section class="block-payment-schedule" style="padding:24px;background:#0001;border-radius:14px;margin:16px 0;">
  <h3 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(p.title ?? 'Payment schedule')}</h3>
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr><th style="text-align:left;padding:8px 12px;opacity:0.7;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Milestone</th><th style="text-align:left;padding:8px 12px;opacity:0.7;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Due</th><th style="text-align:right;padding:8px 12px;opacity:0.7;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">Amount</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
</section>`;
}
