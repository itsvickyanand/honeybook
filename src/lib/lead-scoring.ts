/**
 * Evaluate scoring rules against a lead input.
 */
import { prisma } from './db';

export async function applyScoringRules(tenantId: string, input: Record<string, unknown>): Promise<number> {
  const rules = await prisma.leadScoringRule.findMany({
    where: { tenantId, active: true },
    orderBy: { sortOrder: 'asc' },
  });
  let score = 0;
  for (const rule of rules) {
    const val = input[rule.field];
    if (val === undefined) continue;
    const s = String(val);
    let match = false;
    if (rule.op === 'eq') match = s === rule.value;
    else if (rule.op === 'contains') match = s.toLowerCase().includes(rule.value.toLowerCase());
    else if (rule.op === 'gt') match = Number(val) > Number(rule.value);
    else if (rule.op === 'lt') match = Number(val) < Number(rule.value);
    if (match) score += rule.points;
  }
  return Math.max(0, Math.min(100, score));
}
