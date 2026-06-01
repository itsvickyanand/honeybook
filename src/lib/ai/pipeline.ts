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
import { resolveProposalTemplate } from '../proposals';

export interface RunPipelineArgs {
  tenantId: string;
  brief: string;
  clientName: string;
  /** Which proposal template shapes tone/inclusions/terms (else tenant default). */
  proposalTemplateId?: string | null;
}

export interface PipelineResult {
  doc: ProposalDoc;
  parsedBrief: ParsedBrief;
  issues: ConstraintIssue[];
  templateId: string;
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

  // Resolve the chosen proposal template (or the tenant's default). Drives the
  // AI's tone + house phrases + must-include items, and post-fills empty doc
  // fields after generation.
  const template = await resolveProposalTemplate(args.tenantId, args.proposalTemplateId ?? null);

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

  // Build template-aware instruction block (house phrases + must-include catalog rows).
  const housePhrases = ((template.housePhrases as unknown as string[]) ?? []).filter(Boolean);
  const mustInclude = ((template.alwaysIncludeItems as unknown as string[]) ?? []).filter(Boolean);
  const templateInstructions = [
    template.defaultIntro ? `Opening tone: ${template.defaultIntro}` : '',
    housePhrases.length ? `Weave in these house phrases naturally: ${housePhrases.map((p) => `"${p}"`).join(', ')}.` : '',
    mustInclude.length ? `Always include these catalog rows (slugs or ids): ${mustInclude.join(', ')}.` : '',
    cfg.customInstructions ? `Vendor instructions:\n${cfg.customInstructions}` : '',
  ].filter(Boolean).join('\n\n');

  // C — compose (template.toneHint takes precedence over the generic tenant tone)
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
    tone: template.toneHint || cfg.tone,
    upsellAggressiveness: cfg.upsellAggressiveness,
    customInstructions: templateInstructions || undefined,
  });

  // D — validate
  const { doc: finalDoc, issues } = validateAndFix({
    doc,
    parsed,
    marginFloorPct: cfg.marginFloorPct,
    mandatorySlugs: (cfg.mandatoryItemSlugs as string[] | null) ?? [],
    blacklistedSlugs: (cfg.blacklistedItemSlugs as string[] | null) ?? [],
  });

  // Post-fill template defaults into empty fields (don't clobber what AI produced).
  const tplInclusions = (template.defaultInclusions as unknown as string[]) ?? [];
  const tplTerms = (template.defaultTerms as unknown as string[]) ?? [];
  if (!finalDoc.inclusions?.length && tplInclusions.length) finalDoc.inclusions = [...tplInclusions];
  if (!finalDoc.terms?.length && tplTerms.length) finalDoc.terms = [...tplTerms];
  if (!finalDoc.validityDays) finalDoc.validityDays = template.defaultValidityDays;
  if (!finalDoc.intro && template.defaultIntro) finalDoc.intro = template.defaultIntro;

  return { doc: finalDoc, parsedBrief: parsed, issues, templateId: template.id };
}
