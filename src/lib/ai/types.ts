/**
 * Shared types for the 5-stage AI curation pipeline.
 */
import { z } from 'zod';

export const parsedBriefSchema = z.object({
  guestCount: z.number().nullable().optional(),
  eventDates: z.array(z.string()).optional(),
  city: z.string().nullable().optional(),
  durationDays: z.number().nullable().optional(),
  budgetINR: z.number().nullable().optional(),
  budgetINRMin: z.number().nullable().optional(),
  budgetINRMax: z.number().nullable().optional(),
  dietary: z.array(z.string()).optional(),
  occasion: z.string().nullable().optional(),
  mustHaves: z.array(z.string()).optional(),
  niceToHaves: z.array(z.string()).optional(),
  noGos: z.array(z.string()).optional(),
  vibe: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type ParsedBrief = z.infer<typeof parsedBriefSchema>;

export interface CatalogRetrieval {
  rowId: string;
  tableSlug: string;
  data: Record<string, unknown>;
  score: number;
}

export interface ConstraintIssue {
  severity: 'ERROR' | 'WARN';
  code: string;
  message: string;
  itemId?: string;
}
