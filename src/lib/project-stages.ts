/**
 * Customizable Projects-pipeline stages (HoneyBook-style). Stored per-tenant in
 * ProjectStage; Project.stage holds the `key`. Seeded with sensible defaults on
 * first read so existing tenants light up without a manual step.
 */
import { prisma } from './db';

export interface StageDef { key: string; name: string; color: string; sortOrder: number; isTerminal: boolean }

export const DEFAULT_PROJECT_STAGES: StageDef[] = [
  { key: 'new',            name: 'New',            color: '#64748b', sortOrder: 0, isTerminal: false },
  { key: 'discovery',      name: 'Discovery',      color: '#3b82f6', sortOrder: 1, isTerminal: false },
  { key: 'proposal',       name: 'Proposal',       color: '#8b5cf6', sortOrder: 2, isTerminal: false },
  { key: 'contract_signed',name: 'Contract signed',color: '#a855f7', sortOrder: 3, isTerminal: false },
  { key: 'kickoff',        name: 'Kick off',       color: '#f59e0b', sortOrder: 4, isTerminal: false },
  { key: 'in_progress',    name: 'In progress',    color: '#eab308', sortOrder: 5, isTerminal: false },
  { key: 'completed',      name: 'Completed',      color: '#10b981', sortOrder: 6, isTerminal: true },
  { key: 'archived',       name: 'Archived',       color: '#475569', sortOrder: 7, isTerminal: true },
];

/** The stage key a brand-new project should start in. */
export const INITIAL_STAGE_KEY = 'new';

/** Returns the tenant's stages, seeding defaults if none exist yet. */
export async function ensureProjectStages(tenantId: string): Promise<StageDef[]> {
  const existing = await prisma.projectStage.findMany({
    where: { tenantId },
    orderBy: { sortOrder: 'asc' },
  });
  if (existing.length > 0) {
    return existing.map((s) => ({ key: s.key, name: s.name, color: s.color, sortOrder: s.sortOrder, isTerminal: s.isTerminal }));
  }
  await prisma.projectStage.createMany({
    data: DEFAULT_PROJECT_STAGES.map((s) => ({ tenantId, ...s })),
    skipDuplicates: true,
  });
  return DEFAULT_PROJECT_STAGES;
}
