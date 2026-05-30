/**
 * Apply a raw SQL file against DATABASE_URL.
 * Uses pg (via Prisma's bundled `pg`) — works on any DATABASE_URL format
 * including Prisma-specific query params like `?schema=public&pgbouncer=true`
 * that psql doesn't understand.
 */
import 'dotenv/config';
import { promises as fs } from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: tsx scripts/run-sql.ts <file.sql>');
    process.exit(1);
  }
  const sql = await fs.readFile(path.resolve(file), 'utf8');
  // Split on semicolons that end a statement (naive but works for our scripts).
  // We keep DO $$ ... $$ blocks intact by tracking $$ balance.
  const statements = splitStatements(sql);
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    try {
      await prisma.$executeRawUnsafe(trimmed);
    } catch (e) {
      console.error(`✗ ${trimmed.split('\n')[0].slice(0, 80)}…`);
      console.error('   ', (e as Error).message);
    }
  }
}

function splitStatements(sql: string): string[] {
  // Strip line comments first so semicolons inside them don't confuse the splitter.
  const stripped = sql.split('\n').map((line) => {
    const idx = line.indexOf('--');
    return idx === -1 ? line : line.slice(0, idx);
  }).join('\n');

  const out: string[] = [];
  let buf = '';
  let inDollar = false;
  let i = 0;
  while (i < stripped.length) {
    if (stripped.slice(i, i + 2) === '$$') {
      inDollar = !inDollar;
      buf += '$$';
      i += 2;
      continue;
    }
    const ch = stripped[i];
    if (ch === ';' && !inDollar) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
