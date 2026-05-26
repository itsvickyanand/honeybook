/**
 * The full 5-stage AI proposal pipeline.
 *   A. parse brief → structured constraints
 *   B. retrieve catalog via pgvector RAG
 *   C. compose with Claude using ONLY retrieved rows
 *   D. validate deterministically; auto-fix what we can; surface issues
 *   E. render — handled by the proposal portal renderer
 */
import { prisma } from '../db';
import { ProposalDoc } from '../proposal-schema';
import { ParsedBrief, ConstraintIssue } from './types';
import { parseBrief } from './stage-a-parse';
import { retrieveCatalog } from './stage-b-retrieve';
import { composeProposal } from './stage-c-compose';
import { validateAndFix } from './stage-d-validate';

export interface RunPipelineArgs {
  tenantId: string;
  brief: string;
  clientName: string;
}

export interface PipelineResult {
  doc: ProposalDoc;
  parsedBrief: ParsedBrief;
  issues: ConstraintIssue[];
}

export async function runProposalPipeline(args: RunPipelineArgs): Promise<PipelineResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: args.tenantId },
    include: { businessType: true, aiConfig: true },
  });
  if (!tenant) throw new Error('Tenant not found');
  const cfg = tenant.aiConfig ?? {
    tone: 'warm-professional',
    upsellAggressiveness: 2,
    marginFloorPct: 0,
    customInstructions: null,
    mandatoryItemSlugs: [],
    blacklistedItemSlugs: [],
  };

  // A — parse
  const parsed = await parseBrief(args.brief);

  // B — retrieve
  const rows = await retrieveCatalog({
    tenantId: tenant.id,
    brief: args.brief,
    parsed,
    perTable: 8,
    mandatorySlugs: (cfg.mandatoryItemSlugs as string[] | null) ?? [],
    blacklistedSlugs: (cfg.blacklistedItemSlugs as string[] | null) ?? [],
  });

  // C — compose
  const doc = await composeProposal({
    brief: args.brief,
    parsed,
    rows,
    vendorName: tenant.name,
    vendorBusinessType: tenant.businessType.name,
    clientName: args.clientName,
    currency: tenant.currency,
    taxRate: tenant.taxRate,
    taxLabel: tenant.taxLabel,
    tone: cfg.tone,
    upsellAggressiveness: cfg.upsellAggressiveness,
    customInstructions: cfg.customInstructions ?? undefined,
  });

  // D — validate
  const { doc: finalDoc, issues } = validateAndFix({
    doc,
    parsed,
    marginFloorPct: cfg.marginFloorPct,
    mandatorySlugs: (cfg.mandatoryItemSlugs as string[] | null) ?? [],
    blacklistedSlugs: (cfg.blacklistedItemSlugs as string[] | null) ?? [],
  });

  return { doc: finalDoc, parsedBrief: parsed, issues };
}
