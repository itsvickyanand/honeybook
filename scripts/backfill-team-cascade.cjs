/**
 * One-off backfill: for every Project that has a teamId, materialize
 * ProjectMember(kind=TEAM, inheritedFromTeamId=teamId) rows for every team
 * member who isn't already on the project.
 *
 * Reversible: every row we add has `inheritedFromTeamId` set. To undo:
 *   prisma.projectMember.deleteMany({ where: { inheritedFromTeamId: { not: null } } })
 *
 * Run: DATABASE_URL=<neon-pooled> node scripts/backfill-team-cascade.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const projects = await p.project.findMany({
    where: { teamId: { not: null } },
    select: { id: true, teamId: true, name: true, tenantId: true },
  });
  console.log(`Found ${projects.length} project(s) with a team assignment.`);

  let totalAdded = 0;
  let totalSkippedExisting = 0;
  for (const project of projects) {
    const memberships = await p.teamMembership.findMany({
      where: { teamId: project.teamId },
      select: { userId: true },
    });
    const existing = await p.projectMember.findMany({
      where: { projectId: project.id, userId: { in: memberships.map((m) => m.userId) } },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    const toAdd = memberships.filter((m) => !existingSet.has(m.userId));
    totalSkippedExisting += existing.length;

    if (toAdd.length === 0) {
      console.log(`  ✓ ${project.name}: already in sync (${existing.length} members on project)`);
      continue;
    }
    await p.projectMember.createMany({
      data: toAdd.map((m) => ({
        projectId: project.id,
        userId: m.userId,
        kind: 'TEAM',
        role: 'TEAM',
        inheritedFromTeamId: project.teamId,
      })),
      skipDuplicates: true,
    });
    totalAdded += toAdd.length;
    console.log(`  + ${project.name}: added ${toAdd.length} (preserved ${existing.length} existing)`);
  }

  console.log(`\nDone. Added ${totalAdded} inherited row(s). Preserved ${totalSkippedExisting} existing membership(s).`);
  await p.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
