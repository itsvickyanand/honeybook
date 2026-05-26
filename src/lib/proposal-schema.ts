/**
 * Canonical schema for a proposal document.
 * Stored as JSON in Proposal.contentJson and ProposalVersion.contentJson.
 * Used by the AI generator (output schema) and the client portal (renderer).
 */
import { z } from 'zod';

export const lineItemSchema = z.object({
  id: z.string(), // client-side stable id
  // optional reference back to the catalog source row for traceability
  sourceTableSlug: z.string().optional(),
  sourceRowId: z.string().optional(),
  name: z.string(),
  description: z.string().optional().default(''),
  quantity: z.number().nonnegative().default(1),
  unit: z.string().optional().default('unit'),
  unitPrice: z.number().nonnegative().default(0),
  // Computed = qty * unitPrice (kept for stability across refreshes; recomputed on save)
  amount: z.number().nonnegative().default(0),
  // Optional swap suggestions the AI surfaced (alternates from the catalog)
  alternates: z
    .array(
      z.object({
        sourceRowId: z.string().optional(),
        name: z.string(),
        unitPrice: z.number().nonnegative(),
        note: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export const sectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  intro: z.string().optional().default(''),
  items: z.array(lineItemSchema).default([]),
});

export const proposalDocSchema = z.object({
  title: z.string(),
  greeting: z.string().optional().default(''),
  intro: z.string().optional().default(''),
  sections: z.array(sectionSchema).default([]),
  inclusions: z.array(z.string()).optional().default([]),
  terms: z.array(z.string()).optional().default([]),
  validityDays: z.number().int().positive().optional().default(14),
  // Pricing
  discount: z.number().min(0).optional().default(0),
  taxRate: z.number().min(0).max(100).optional().default(18),
  taxLabel: z.string().optional().default('GST'),
  currency: z.string().optional().default('INR'),
  // Brand context
  vendorName: z.string().optional().default(''),
  clientName: z.string().optional().default(''),
});

export type ProposalDoc = z.infer<typeof proposalDocSchema>;
export type LineItem = z.infer<typeof lineItemSchema>;
export type ProposalSection = z.infer<typeof sectionSchema>;

export function computeTotals(doc: ProposalDoc) {
  let subtotal = 0;
  for (const s of doc.sections) {
    for (const li of s.items) {
      const amount = (li.quantity || 0) * (li.unitPrice || 0);
      li.amount = round2(amount);
      subtotal += amount;
    }
  }
  const discount = doc.discount || 0;
  const taxableBase = Math.max(0, subtotal - discount);
  const taxAmount = round2((taxableBase * (doc.taxRate || 0)) / 100);
  const total = round2(taxableBase + taxAmount);
  return { subtotal: round2(subtotal), discount: round2(discount), taxAmount, total };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
