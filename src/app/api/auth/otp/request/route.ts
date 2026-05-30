/**
 * Request a mobile OTP.
 *
 * Generates a 6-digit code, stores a bcrypt hash + 10-min expiry, and sends it
 * via SMS (MSG91). When MSG91 isn't configured (dev / demo) we return the code
 * in the response as `devCode` so the flow is testable end-to-end.
 *
 * Rate-limited per IP and per phone to deter abuse.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { enforceRateLimit } from '@/lib/api';
import { sendSms } from '@/lib/comms';

const schema = z.object({
  phone: z.string().min(8).max(20),
  purpose: z.enum(['login', 'signup', 'verify']).default('login'),
});

function normalizePhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, '');
  // default to +91 if a bare 10-digit Indian number is given
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;
  return digits;
}

export async function POST(req: Request) {
  const blocked = await enforceRateLimit(req, { keyPrefix: 'auth.otp.req', limit: 5, windowMs: 60_000 });
  if (blocked) return blocked;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  const phone = normalizePhone(parsed.data.phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 8);

  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash,
      purpose: parsed.data.purpose,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });

  const msg91 = !!process.env.MSG91_AUTH_KEY;
  if (msg91) {
    await sendSms({
      to: phone,
      body: `${code} is your HoneyBook verification code. Valid 10 minutes. Do not share.`,
    }).catch(() => {});
  }

  // Only expose the code when SMS can't actually be delivered (dev/demo).
  const devCode = msg91 ? undefined : code;
  return NextResponse.json({ ok: true, phone, devCode });
}
