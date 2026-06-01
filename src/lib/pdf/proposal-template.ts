/**
 * Proposal HTML renderer.
 * Honors the proposal's ProposalTemplate (cover/about HTML, accent color,
 * cover image, section recipe + merge fields). Falls back to the previous
 * minimal layout when no template is associated.
 */
import type { Proposal, Tenant, ProposalTemplate } from '@prisma/client';
import { ProposalDoc } from '../proposal-schema';
import { formatCurrency } from '../utils';
import { prisma } from '../db';
import { renderTemplate, proposalDocument, DEFAULT_SECTION_ORDER, type SectionKey } from '../proposals/render';

export async function renderProposalHtml(p: Proposal & { tenant: Tenant }): Promise<string> {
  const doc = p.contentJson as unknown as ProposalDoc;
  const t = p.tenant;

  // Resolve template (best-effort; null = use the simple fallback path).
  const template: ProposalTemplate | null = p.proposalTemplateId
    ? await prisma.proposalTemplate.findUnique({ where: { id: p.proposalTemplateId } }).catch(() => null)
    : null;

  const vars = {
    clientName: doc.clientName ?? p.clientName ?? '',
    vendorName: t.name,
    businessName: t.name,
    projectName: p.title,
    total: formatCurrency(p.total, t.currency, t.locale),
    eventDate: '',
    date: new Date().toLocaleDateString('en-IN'),
  };

  const accentColor = template?.accentColor || t.brandColor || '#8b5cf6';
  const coverImageUrl = template?.coverImageUrl || null;

  // Render each section block according to the recipe; merge {{fields}} as we go.
  const order: SectionKey[] = template?.sectionOrder
    ? (template.sectionOrder as unknown as SectionKey[])
    : DEFAULT_SECTION_ORDER;

  const blocks = order
    .map((key) => sectionBlock(key, doc, p, t, template, vars))
    .filter(Boolean)
    .join('\n');

  return proposalDocument(blocks, { title: p.title, accentColor, coverImageUrl });
}

function sectionBlock(
  key: SectionKey,
  doc: ProposalDoc,
  p: Proposal,
  t: Tenant,
  template: ProposalTemplate | null,
  vars: Parameters<typeof renderTemplate>[1],
): string {
  switch (key) {
    case 'cover': {
      const cover = template?.coverHtml
        ? renderTemplate(template.coverHtml, vars)
        : `<h1>${escapeHtml(p.title)}</h1><p class="muted">${escapeHtml(t.name)} · ${vars.date}</p>`;
      const intro = doc.intro ? `<p>${escapeHtml(doc.intro)}</p>` : '';
      return `<section class="section">${cover}${intro}</section>`;
    }
    case 'about': {
      if (!template?.aboutHtml) return '';
      return `<section class="section">${renderTemplate(template.aboutHtml, vars)}</section>`;
    }
    case 'sections': {
      const tables = (doc.sections ?? []).map((s) => `
        <h2>${escapeHtml(s.title)}</h2>
        ${s.intro ? `<p class="muted">${escapeHtml(s.intro)}</p>` : ''}
        <table>
          <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
          <tbody>
          ${s.items.map((it) => `
            <tr>
              <td><strong>${escapeHtml(it.name)}</strong>${it.description ? `<br><span class="muted">${escapeHtml(it.description)}</span>` : ''}</td>
              <td class="r">${it.quantity} ${escapeHtml(it.unit)}</td>
              <td class="r">${formatCurrency(it.unitPrice, t.currency, t.locale)}</td>
              <td class="r"><strong>${formatCurrency(it.amount, t.currency, t.locale)}</strong></td>
            </tr>`).join('')}
          </tbody>
        </table>`).join('');
      const totals = `
        <table style="width:280px;margin-left:auto;margin-top:24px">
          <tr><td>Subtotal</td><td class="r">${formatCurrency(p.subtotal, t.currency, t.locale)}</td></tr>
          <tr><td>${escapeHtml(t.taxLabel)} (${doc.taxRate ?? 0}%)</td><td class="r">${formatCurrency(p.taxAmount, t.currency, t.locale)}</td></tr>
          <tr><td><strong>Total</strong></td><td class="r"><strong>${formatCurrency(p.total, t.currency, t.locale)}</strong></td></tr>
        </table>`;
      return `<section class="section">${tables}${totals}</section>`;
    }
    case 'inclusions': {
      const list = doc.inclusions ?? [];
      if (!list.length) return '';
      return `<section class="section"><h2>What's included</h2><ul>${list.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></section>`;
    }
    case 'terms': {
      const list = doc.terms ?? [];
      if (!list.length) return '';
      return `<section class="section"><h2>Terms</h2><ul>${list.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></section>`;
    }
    case 'cta': {
      return `<section class="section"><h2>Next steps</h2><p>To confirm the booking, sign the agreement and pay the retainer. The retainer is non-refundable and locks the date.</p></section>`;
    }
    default:
      return '';
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
