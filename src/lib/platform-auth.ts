/**
 * Platform-admin auth — completely separate session cookie + JWT secret from
 * the tenant auth in lib/auth.ts.
 *
 * Why separate:
 *   - Different audience: platform admins manage the SaaS itself; tenant users
 *     manage their business inside it.
 *   - Different blast radius: a stolen tenant cookie should never grant admin.
 *   - Different scopes & lifetimes: admin sessions are shorter (1d default)
 *     and require TOTP for sensitive ops.
 */
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const COOKIE_NAME = 'hb_admin_session';
const ALG = 'HS256';

function secret() {
  // Falls back to JWT_SECRET so admin auth works in dev without extra env vars,
  // but production should set PLATFORM_JWT_SECRET independently.
  const s = process.env.PLATFORM_JWT_SECRET || process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('PLATFORM_JWT_SECRET (or JWT_SECRET) must be set (min 16 chars)');
  return new TextEncoder().encode(s);
}

export interface PlatformSessionPayload {
  adminId: string;
  email: string;
  role: 'ADMIN' | 'SUPPORT' | 'READONLY';
}

export async function issuePlatformSession(payload: PlatformSessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
}

export async function clearPlatformSession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getPlatformSession(): Promise<PlatformSessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as PlatformSessionPayload;
  } catch {
    return null;
  }
}

export async function hashPlatformPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}
export async function verifyPlatformPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export const PLATFORM_SESSION_COOKIE = COOKIE_NAME;
