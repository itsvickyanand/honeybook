/**
 * Stage D — Deterministic constraint validation.
 *
 * Runs after the LLM composes. Fixes obvious problems and reports issues
 * for the vendor to review.
 */
import { ProposalDoc, computeTotals } from '../proposal-schema';
import { ParsedBrief, ConstraintIssue } from './types';

export interface ValidationResult {
  doc: ProposalDoc;
  issues: ConstraintIssue[];
}

export interface ValidateArgs {
  doc: ProposalDoc;
  parsed: ParsedBrief;
  marginFloorPct: number;
  mandatorySlugs: string[];
  blacklistedSlugs: string[];
}

export function validateAndFix(args: ValidateArgs): ValidationResult {
  const issues: ConstraintIssue[] = [];
  const doc = args.doc;

  // 1. Drop zero-priced items unless flagged as inclusion-only
  for (const section of doc.sections) {
    section.items = section.items.filter((it) => {
      if (it.unitPrice <= 0 && it.quantity > 0) {
        issues.push({
          severity: 'WARN',
          code: 'ZERO_PRICE',
          message: `Removed "${it.name}" — unit price is 0`,
          itemId: it.id,
        });
        return false;
      }
      return true;
    });
  }

  // 2. Blacklist enforcement (safety net — Stage B already filters)
  const bl = new Set(args.blacklistedSlugs.map((s) => s.toLowerCase()));
  if (bl.size > 0) {
    for (const section of doc.sections) {
      section.items = section.items.filter((it) => {
        const slug = String(it.sourceTableSlug ?? '').toLowerCase();
        const name = it.name.toLowerCase();
        const hit = [...bl].some((b) => slug.includes(b) || name.includes(b));
        if (hit) {
          issues.push({ severity: 'WARN', code: 'BLACKLIST_HIT', message: `Removed blacklisted item "${it.name}"`, itemId: it.id });
          return false;
        }
        return true;
      });
    }
  }

  // 3. Budget check
  const totals = computeTotals(doc);
  if (args.parsed.budgetINRMax && totals.total > args.parsed.budgetINRMax * 1.1) {
    issues.push({
      severity: 'ERROR',
      code: 'OVER_BUDGET',
      message: `Total ₹${totals.total.toFixed(0)} exceeds budget ceiling ₹${args.parsed.budgetINRMax} by >10%`,
    });
  }

  // 4. Margin floor (informational; we don't know cost yet — placeholder)
  if (args.marginFloorPct > 0 && doc.discount > 0) {
    const discountPct = (doc.discount / totals.subtotal) * 100;
    if (discountPct > 100 - args.marginFloorPct) {
      issues.push({
        severity: 'WARN',
        code: 'DISCOUNT_BELOW_FLOOR',
        message: `Discount ${discountPct.toFixed(1)}% may push below margin floor ${args.marginFloorPct}%`,
      });
    }
  }

  // 5. Empty sections cleanup
  doc.sections = doc.sections.filter((s) => s.items.length > 0);

  // 6. Recompute totals
  computeTotals(doc);

  return { doc, issues };
}
