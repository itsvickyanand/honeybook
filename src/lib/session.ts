/**
 * Server-side session helper that returns the full session + user + tenant
 * + role records. Use in server components and route handlers.
 */
import { redirect } from 'next/navigation';
import { prisma } from './db';
import { getSession } from './auth';

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export async function getCurrentContext() {
  const s = await getSession();
  if (!s) return null;
  const user = await prisma.user.findUnique({
    where: { id: s.userId },
    include: {
      role: true,
      tenant: { include: { businessType: true } },
    },
  });
  if (!user) return null;
  return {
    session: s,
    user,
    tenant: user.tenant,
    role: user.role,
    permissions: parsePermissions(user.role.permissions as unknown),
  };
}

export async function requireContext() {
  const ctx = await getCurrentContext();
  if (!ctx) redirect('/login');
  return ctx;
}

export function parsePermissions(input: unknown): string[] {
  if (Array.isArray(input)) return input as string[];
  if (typeof input === 'string') {
    try {
      const arr = JSON.parse(input);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function hasPermission(permissions: string[], required: string) {
  if (permissions.includes('*')) return true;
  if (permissions.includes(required)) return true;
  // wildcard matching, e.g. catalog.* matches catalog.edit
  for (const p of permissions) {
    if (p.endsWith('.*') && required.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}
