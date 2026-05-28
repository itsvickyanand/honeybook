/**
 * RLS isolation smoke test (one-off, delete after running).
 *
 * Creates two ephemeral tenants T_A and T_B, inserts one Contact row in each
 * via withTenant(), then attempts to read T_A's data from a session set to
 * T_B's tenant id — must return zero rows.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { withTenant } from '../src/lib/db-rls';

const p = new PrismaClient();

type AnyTx = { $queryRawUnsafe: (sql: string, ...args: unknown[]) => Promise<unknown> };

async function rawCount(tx: AnyTx, tenantId: string) {
  const rows = (await tx.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS n FROM "Contact" WHERE "tenantId" = $1',
    tenantId,
  )) as Array<{ n: number }>;
  return rows[0].n;
}

async function main() {
  // Bypass RLS as owner to set up + tear down.
  console.log('Setup as owner (bypasses RLS because no GUC set, but FORCEd policy returns 0 for SELECT — so we use raw inserts).');

  // Create two tenants directly. INSERTs to tables with FORCE RLS still need
  // to pass WITH CHECK — but the Tenant table policy is `id = setting`, so we
  // can't even INSERT without setting the GUC first. Do each inside a txn.
  const tA = 'rlstest' + Math.random().toString(36).slice(2, 10);
  const tB = 'rlstest' + Math.random().toString(36).slice(2, 10);

  // Pick any BusinessType so the FK is satisfied; create one if missing.
  let btRows = await p.$queryRawUnsafe<any[]>(`SELECT id FROM "BusinessType" LIMIT 1`);
  let createdBt: string | null = null;
  if (!btRows[0]) {
    createdBt = 'btrls' + Math.random().toString(36).slice(2, 10);
    await p.$executeRawUnsafe(
      `INSERT INTO "BusinessType" (id, slug, name, description, icon, "accentColor", "templateJson", "createdAt")
       VALUES ($1, $2, $3, '', '', '#000', '{}'::jsonb, NOW())`,
      createdBt, createdBt, 'RLS Test BT',
    );
    btRows = await p.$queryRawUnsafe<any[]>(`SELECT id FROM "BusinessType" WHERE id=$1`, createdBt);
  }
  const businessTypeId = btRows[0].id as string;

  async function makeTenant(id: string) {
    await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${id}'`);
      await tx.$executeRawUnsafe(
        `INSERT INTO "Tenant" (id, slug, name, "businessTypeId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        id, id, `RLS Test ${id}`, businessTypeId,
      );
    });
  }
  await makeTenant(tA);
  await makeTenant(tB);
  console.log(`Created tenants: ${tA}, ${tB}`);

  // Insert one Contact per tenant via withTenant.
  await withTenant(tA, async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "Contact" (id, "tenantId", "fullName", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
      'cA' + Math.random().toString(36).slice(2, 12), tA, 'Alice@A',
    );
  });
  await withTenant(tB, async (tx) => {
    await tx.$executeRawUnsafe(
      `INSERT INTO "Contact" (id, "tenantId", "fullName", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW())`,
      'cB' + Math.random().toString(36).slice(2, 12), tB, 'Bob@B',
    );
  });

  // Sanity: each tenant sees exactly 1 of its own rows.
  const aSeesOwn = await withTenant(tA, async (tx) => rawCount(tx, tA));
  const bSeesOwn = await withTenant(tB, async (tx) => rawCount(tx, tB));
  console.log(`Self-read counts: A→A=${aSeesOwn}, B→B=${bSeesOwn} (expect 1, 1)`);

  // Cross-tenant: from session=A try to read B's tenantId — must be 0.
  const aSeesB = await withTenant(tA, async (tx) => rawCount(tx, tB));
  const bSeesA = await withTenant(tB, async (tx) => rawCount(tx, tA));
  console.log(`Cross-tenant counts: A→B=${aSeesB}, B→A=${bSeesA} (expect 0, 0)`);

  // No-tenant: raw query without SET LOCAL must return 0 (fail closed).
  const leaked = await p.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*)::int AS n FROM "Contact" WHERE "tenantId" IN ($1, $2)`,
    tA, tB,
  );
  console.log(`No-tenant raw count: ${leaked[0].n} (expect 0 — FORCE RLS blocks the owner)`);

  // Cleanup: delete each tenant inside its own session.
  await withTenant(tA, async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "Contact" WHERE "tenantId" = $1`, tA);
    await tx.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, tA);
  });
  await withTenant(tB, async (tx) => {
    await tx.$executeRawUnsafe(`DELETE FROM "Contact" WHERE "tenantId" = $1`, tB);
    await tx.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, tB);
  });
  if (createdBt) {
    await p.$executeRawUnsafe(`DELETE FROM "BusinessType" WHERE id = $1`, createdBt);
  }
  console.log('Cleaned up.');

  const pass =
    aSeesOwn === 1 && bSeesOwn === 1 &&
    aSeesB === 0 && bSeesA === 0 &&
    leaked[0].n === 0;
  console.log(pass ? '\n✅ RLS isolation verified' : '\n❌ RLS LEAK DETECTED');
  if (!pass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
