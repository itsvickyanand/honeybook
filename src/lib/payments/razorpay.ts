/**
 * Razorpay adapter.
 *
 * - Creates payment links pointing at an invoice
 * - Verifies inbound webhooks
 * - Mock mode (no API key) so demos and local dev work without credentials
 */
import crypto from 'crypto';
import { logger } from '../logger';

export interface CreatePaymentLinkArgs {
  amountInRupees: number;
  currency?: string;
  description: string;
  reference: string; // our internal id (paymentId)
  customer: { name: string; email?: string; phone?: string };
  callbackUrl?: string;
  notes?: Record<string, string>;
}
export interface CreatePaymentLinkResult {
  providerOrderId: string;
  shortUrl: string;
  mock: boolean;
}

const HOST = 'https://api.razorpay.com/v1';

export async function createPaymentLink(args: CreatePaymentLinkArgs): Promise<CreatePaymentLinkResult> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) {
    const mockId = `plink_mock_${args.reference}`;
    logger.warn({ reference: args.reference }, 'razorpay.mock-mode');
    const back = args.callbackUrl ?? '';
    const backParam = back ? `&back=${encodeURIComponent(back)}` : '';
    return {
      providerOrderId: mockId,
      shortUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-pay?ref=${args.reference}${backParam}`,
      mock: true,
    };
  }
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${HOST}/payment_links`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(args.amountInRupees * 100), // paise
      currency: args.currency ?? 'INR',
      accept_partial: true,
      description: args.description,
      reference_id: args.reference,
      customer: {
        name: args.customer.name,
        email: args.customer.email,
        contact: args.customer.phone,
      },
      notify: { sms: !!args.customer.phone, email: !!args.customer.email },
      callback_url: args.callbackUrl,
      callback_method: 'get',
      notes: args.notes,
    }),
  });
  if (!res.ok) throw new Error(`Razorpay ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; short_url: string };
  return { providerOrderId: data.id, shortUrl: data.short_url, mock: false };
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // accept in dev only
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  // timingSafeEqual throws if lengths differ — guard first so a malformed
  // signature returns a clean false (→ 401) instead of throwing (→ 500).
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Fetch the current status of a payment link (for the reconcile-sweep cron).
 * Returns null on any error / mock id so callers can skip gracefully.
 */
export async function fetchPaymentLinkStatus(
  paymentLinkId: string
): Promise<{ status: string; amountPaid: number } | null> {
  const id = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) return null;
  if (paymentLinkId.startsWith('plink_mock_')) return null;
  try {
    const auth = Buffer.from(`${id}:${secret}`).toString('base64');
    const res = await fetch(`${HOST}/payment_links/${paymentLinkId}`, {
      headers: { authorization: `Basic ${auth}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { status: string; amount_paid?: number };
    // Razorpay statuses: created | partially_paid | paid | cancelled | expired
    return { status: data.status, amountPaid: (data.amount_paid ?? 0) / 100 };
  } catch {
    return null;
  }
}
