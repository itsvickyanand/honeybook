/**
 * Server-side contract helpers (prisma). Pure render helpers live in
 * ./contracts-render (client-safe) and are re-exported here for server callers.
 */
import { prisma } from './db';
import { DEFAULT_CONTRACT_HTML } from './contracts-render';

export {
  MERGE_FIELDS,
  DEFAULT_CONTRACT_HTML,
  renderContract,
  contractDocument,
  type ContractVars,
} from './contracts-render';

/** Ensure the tenant has at least one contract template; returns the default. */
export async function ensureDefaultContract(tenantId: string) {
  const existingDefault = await prisma.contractTemplate.findFirst({
    where: { tenantId, archived: false, isDefault: true },
  });
  if (existingDefault) return existingDefault;
  const any = await prisma.contractTemplate.findFirst({ where: { tenantId, archived: false } });
  if (any) return any;
  return prisma.contractTemplate.create({
    data: { tenantId, name: 'Standard Service Agreement', bodyHtml: DEFAULT_CONTRACT_HTML, isDefault: true },
  });
}

/** Resolve the contract template a proposal should use (explicit → tenant default). */
export async function resolveContractForProposal(tenantId: string, contractTemplateId: string | null) {
  if (contractTemplateId) {
    const t = await prisma.contractTemplate.findFirst({ where: { id: contractTemplateId, tenantId } });
    if (t) return t;
  }
  return ensureDefaultContract(tenantId);
}
