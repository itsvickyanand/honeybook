/**
 * Platform admin CLI — create / list / reset platform admin accounts.
 *
 * Usage:
 *   npx tsx scripts/platform-admin.ts list
 *   npx tsx scripts/platform-admin.ts create <email> [password] [fullName]
 *   npx tsx scripts/platform-admin.ts reset <email> [newPassword]
 *
 * If password is omitted, a strong random password is generated and printed
 * ONCE to stdout. It is never stored in plaintext — only the bcrypt hash.
 *
 * Env: needs DATABASE_URL + DIRECT_URL set (load from .env or .env.production).
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generatePassword(): string {
  // 16 chars from a URL-safe alphabet — easy to copy out of a terminal.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(16);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

async function cmdList() {
  const admins = await prisma.platformAdmin.findMany({
    select: { id: true, email: true, fullName: true, role: true, lastLoginAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admins.length === 0) {
    console.log('No platform admins exist. Create one with:');
    console.log('  npx tsx scripts/platform-admin.ts create you@example.com');
    return;
  }
  console.log(`${admins.length} platform admin(s):`);
  for (const a of admins) {
    const last = a.lastLoginAt ? a.lastLoginAt.toISOString().slice(0, 10) : 'never';
    console.log(`  · ${a.email}  (${a.role})  last login: ${last}`);
  }
}

async function cmdCreate(email: string, password: string | undefined, fullName: string | undefined) {
  if (!email || !email.includes('@')) {
    console.error('Usage: create <email> [password] [fullName]');
    process.exit(1);
  }
  const existing = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    console.error(`Admin already exists for ${email}. Use the reset command to change password.`);
    process.exit(1);
  }
  const pw = password || generatePassword();
  const generated = !password;
  const hash = await bcrypt.hash(pw, 12);
  const admin = await prisma.platformAdmin.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: hash,
      fullName: fullName ?? email.split('@')[0],
      role: 'super_admin',
    },
  });
  console.log('────────────────────────────────────────────────────────────');
  console.log('  ✅ Platform admin created');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  ID:        ${admin.id}`);
  console.log(`  Email:     ${admin.email}`);
  console.log(`  Role:      ${admin.role}`);
  console.log(`  Full name: ${admin.fullName}`);
  if (generated) {
    console.log('');
    console.log(`  🔑 Generated password (shown ONCE — copy it now):`);
    console.log('');
    console.log(`     ${pw}`);
    console.log('');
    console.log('  ⚠️  This password is NOT stored in plaintext. If lost, run the');
    console.log('     reset command to set a new one.');
  } else {
    console.log('  🔑 Password: (as provided)');
  }
  console.log('────────────────────────────────────────────────────────────');
  console.log('  Login at: <APP_URL>/admin/login');
  console.log('────────────────────────────────────────────────────────────');
}

async function cmdReset(email: string, password: string | undefined) {
  if (!email || !email.includes('@')) {
    console.error('Usage: reset <email> [newPassword]');
    process.exit(1);
  }
  const existing = await prisma.platformAdmin.findUnique({ where: { email: email.toLowerCase() } });
  if (!existing) {
    console.error(`No admin found for ${email}. Use create to add one.`);
    process.exit(1);
  }
  const pw = password || generatePassword();
  const generated = !password;
  const hash = await bcrypt.hash(pw, 12);
  await prisma.platformAdmin.update({
    where: { id: existing.id },
    data: { passwordHash: hash },
  });
  console.log(`✅ Password reset for ${email}`);
  if (generated) {
    console.log('');
    console.log(`🔑 New password (shown ONCE — copy it now):`);
    console.log('');
    console.log(`   ${pw}`);
    console.log('');
  }
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  try {
    if (cmd === 'list') {
      await cmdList();
    } else if (cmd === 'create') {
      await cmdCreate(rest[0], rest[1], rest.slice(2).join(' '));
    } else if (cmd === 'reset') {
      await cmdReset(rest[0], rest[1]);
    } else {
      console.log('Usage:');
      console.log('  npx tsx scripts/platform-admin.ts list');
      console.log('  npx tsx scripts/platform-admin.ts create <email> [password] [fullName]');
      console.log('  npx tsx scripts/platform-admin.ts reset <email> [newPassword]');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
