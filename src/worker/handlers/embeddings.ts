import { Job } from 'bullmq';
import { prisma } from '../../lib/db';
import { embedTexts } from '../../lib/embeddings';
import { logger } from '../../lib/logger';

/**
 * Build/refresh embedding for a CustomRow.
 */
export async function handleEmbeddingsBuildRow(job: Job): Promise<unknown> {
  const { rowId } = job.data as { rowId: string };
  const row = await prisma.customRow.findUnique({
    where: { id: rowId },
    include: { table: { include: { columns: { orderBy: { sortOrder: 'asc' } } } } },
  });
  if (!row) return { skipped: 'not-found' };
  const data = row.data as Record<string, unknown>;
  const parts: string[] = [row.table.name];
  for (const c of row.table.columns) {
    const v = data[c.slug];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) parts.push(`${c.name}: ${(v as unknown[]).join(', ')}`);
    else parts.push(`${c.name}: ${String(v)}`);
  }
  const text = parts.join('. ');
  const [vector] = await embedTexts([text]);

  // Persist via raw SQL (Prisma can't yet write vector(N) types natively).
  // ::vector cast is required when sending a JS array.
  await prisma.$executeRawUnsafe(
    `UPDATE "CustomRow" SET embedding = $1::vector, "embeddingDirty" = false WHERE id = $2`,
    `[${vector.join(',')}]`,
    rowId
  );
  return { rowId, dim: vector.length };
}

/**
 * Reindex every dirty row for a tenant. Used after a column type change or
 * initial setup.
 */
export async function handleEmbeddingsReindexTenant(job: Job): Promise<unknown> {
  const { tenantId } = job.data as { tenantId: string };
  const rows = await prisma.customRow.findMany({
    where: { table: { tenantId }, embeddingDirty: true },
    select: { id: true },
    take: 500,
  });
  logger.info({ tenantId, count: rows.length }, 'embeddings.tenant.reindex-batch');
  // Fan out (sequential — simple). Production would batch into chunks.
  for (const r of rows) {
    await handleEmbeddingsBuildRow({ data: { rowId: r.id } } as unknown as Job);
  }
  return { processed: rows.length };
}
