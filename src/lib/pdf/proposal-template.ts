import type { Proposal, Tenant } from '@prisma/client';
import { ProposalDoc } from '../proposal-schema';
import { formatCurrency } from '../utils';

export function renderProposalHtml(p: Proposal & { tenant: Tenant }): string {
  const doc = p.contentJson as unknown as ProposalDoc;
  const t = p.tenant;
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(p.title)}</title>
<style>
body{font-family:ui-sans-serif,system-ui,sans-serif;padding:48px;color:#111;background:#fff;}
h1{font-size:36px;margin:0 0 8px}
h2{font-size:22px;margin:32px 0 12px}
.muted{color:#666}
table{width:100%;border-collapse:collapse}
th,td{padding:6px 10px;border-bottom:1px solid #eee;font-size:14px}
.r{text-align:right}
.total{font-weight:700;font-size:18px}
</style></head><body>
<div style="border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px">
  <div class="muted">${escapeHtml(t.name)} — Proposal</div>
  <h1>${escapeHtml(p.title)}</h1>
  <div class="muted">${escapeHtml(doc.clientName ?? p.clientName ?? '')}</div>
</div>
${doc.intro ? `<p>${escapeHtml(doc.intro)}</p>` : ''}
${doc.sections.map((s) => `
  <h2>${escapeHtml(s.title)}</h2>
  ${s.intro ? `<p class="muted">${escapeHtml(s.intro)}</p>` : ''}
  <table>
    ${s.items.map((it) => `
      <tr>
        <td><strong>${escapeHtml(it.name)}</strong>${it.description ? `<br><span class="muted">${escapeHtml(it.description)}</span>` : ''}</td>
        <td class="r">${it.quantity} ${escapeHtml(it.unit)}</td>
        <td class="r">${formatCurrency(it.unitPrice, t.currency, t.locale)}</td>
        <td class="r"><strong>${formatCurrency(it.amount, t.currency, t.locale)}</strong></td>
      </tr>`).join('')}
  </table>
`).join('')}
<table style="width:280px;margin-left:auto;margin-top:32px">
  <tr><td>Subtotal</td><td class="r">${formatCurrency(p.subtotal, t.currency, t.locale)}</td></tr>
  <tr><td>${t.taxLabel} (${doc.taxRate}%)</td><td class="r">${formatCurrency(p.taxAmount, t.currency, t.locale)}</td></tr>
  <tr><td class="total">Total</td><td class="r total">${formatCurrency(p.total, t.currency, t.locale)}</td></tr>
</table>
${doc.terms?.length ? `<h2>Terms</h2><ul>${doc.terms.map((t)=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>` : ''}
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
