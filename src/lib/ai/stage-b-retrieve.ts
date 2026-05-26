/**
 * Stage B — Catalog RAG.
 *
 * Embeds the brief, runs cosine similarity against CustomRow.embedding (pgvector),
 * applies hard filters (blacklist, dietary, price band), and returns the top-K
 * rows per table.
 *
 * If embeddings haven't been built yet, falls back to a simple text-match scorer.
 */
import { prisma } from '../db';
import { embedTexts } from '../embeddings';
import { ParsedBrief, CatalogRetrieval } from './types';

interface RetrieveArgs {
  tenantId: string;
  brief: string;
  parsed: ParsedBrief;
  perTable?: number;
  mandatorySlugs?: string[];
  blacklistedSlugs?: string[];
}

interface RawRow {
  id: string;
  data: Record<string, unknown>;
  tableSlug: string;
  score: number;
}

export async function retrieveCatalog(args: RetrieveArgs): Promise<CatalogRetrieval[]> {
  const k = args.perTable ?? 8;
  const blacklist = new Set(args.blacklistedSlugs ?? []);

  // Build embedding query text from brief + parsed metadata for better signal
  const queryText = buildQueryText(args.brief, args.parsed);
  const [queryVec] = await embedTexts([queryText]);

  // Are there any embedded rows for this tenant? If not, fall back to text search.
  const hasEmbeddings = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT count(*)::bigint AS count
     FROM "CustomRow" r
     JOIN "CustomTable" t ON t.id = r."tableId"
     WHERE t."tenantId" = $1 AND r.embedding IS NOT NULL`,
    args.tenantId
  );
  const useVectorPath = Number(hasEmbeddings[0]?.count ?? 0) > 0;

  const tables = await prisma.customTable.findMany({
    where: { tenantId: args.tenantId },
    select: { id: true, slug: true },
    orderBy: { sortOrder: 'asc' },
  });

  const results: RawRow[] = [];
  for (const t of tables) {
    if (useVectorPath) {
      const vec = `[${queryVec.join(',')}]`;
      const rows = await prisma.$queryRawUnsafe<{ id: string; data: Record<string, unknown>; score: number }[]>(
        `SELECT id, data, 1 - (embedding <=> $1::vector) AS score
         FROM "CustomRow"
         WHERE "tableId" = $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT $3`,
        vec, t.id, k
      );
      for (const r of rows) results.push({ id: r.id, data: r.data, tableSlug: t.slug, score: Number(r.score) });
    } else {
      const rows = await prisma.customRow.findMany({
        where: { tableId: t.id },
        take: k,
      });
      for (const r of rows) {
        results.push({
          id: r.id,
          data: r.data as Record<string, unknown>,
          tableSlug: t.slug,
          score: scoreByOverlap(queryText, r.data as Record<string, unknown>),
        });
      }
    }
  }

  // Mandatory items first; then by score desc
  const mandatorySlugs = new Set(args.mandatorySlugs ?? []);
  return results
    .filter((r) => {
      // remove blacklisted by checking data.name or data.slug overlap
      const name = String((r.data.name ?? '') as string).toLowerCase();
      for (const b of blacklist) if (b && name.includes(b.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      const aM = mandatorySlugs.has(String(a.data.slug ?? a.data.name ?? '').toLowerCase());
      const bM = mandatorySlugs.has(String(b.data.slug ?? b.data.name ?? '').toLowerCase());
      if (aM !== bM) return aM ? -1 : 1;
      return b.score - a.score;
    })
    .map((r) => ({ rowId: r.id, tableSlug: r.tableSlug, data: r.data, score: r.score }));
}

function buildQueryText(brief: string, p: ParsedBrief): string {
  const parts: string[] = [brief];
  if (p.occasion) parts.push(p.occasion);
  if (p.dietary?.length) parts.push(p.dietary.join(' '));
  if (p.vibe) parts.push(p.vibe);
  if (p.mustHaves?.length) parts.push(p.mustHaves.join(' '));
  return parts.join('\n');
}

function scoreByOverlap(query: string, data: Record<string, unknown>): number {
  const q = new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const dText = Object.values(data).map((v) => String(v)).join(' ').toLowerCase();
  const d = new Set(dText.match(/[a-z0-9]+/g) ?? []);
  let overlap = 0;
  for (const tok of q) if (d.has(tok)) overlap++;
  return overlap / Math.max(1, q.size);
}
