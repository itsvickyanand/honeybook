/**
 * Zoho Books accounting adapter.
 *
 * Implements the minimal flow: refresh access token (OAuth) → create invoice.
 * Tenants must complete OAuth via /api/accounting/zoho/callback first.
 *
 * Without ZOHO_CLIENT_ID set, this is a no-op stub that returns a fake external id
 * so the worker pipeline still flows end-to-end in dev.
 */
import { prisma } from '../db';

export async function pushInvoiceToZoho(tenantId: string, invoiceId: string): Promise<string> {
  if (!process.env.ZOHO_CLIENT_ID) {
    // Dev/demo mode — pretend it succeeded.
    return `mock-zoho-${invoiceId.slice(-8)}`;
  }
  const conn = await prisma.accountingConnection.findUnique({
    where: { tenantId_provider: { tenantId, provider: 'zoho' } },
  });
  if (!conn || conn.status !== 'CONNECTED') throw new Error('Zoho not connected');

  const accessToken = await ensureZohoAccessToken(conn);
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { proposal: true, tenant: true },
  });
  if (!invoice) throw new Error('Invoice missing');

  const orgId = (conn.meta as { organizationId?: string } | null)?.organizationId;
  if (!orgId) throw new Error('Zoho organizationId not set');

  const lineItems = ((invoice.contentJson as unknown) as { lineItems?: { name: string; quantity: number; unitPrice: number }[] }).lineItems ?? [];
  const res = await fetch(`https://www.zohoapis.in/books/v3/invoices?organization_id=${orgId}`, {
    method: 'POST',
    headers: { authorization: `Zoho-oauthtoken ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      customer_name: invoice.proposal?.clientName ?? 'Walk-in client',
      invoice_number: invoice.number,
      date: invoice.issueDate.toISOString().slice(0, 10),
      line_items: lineItems.map((li) => ({
        name: li.name,
        rate: li.unitPrice,
        quantity: li.quantity,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { invoice: { invoice_id: string } };
  return data.invoice.invoice_id;
}

async function ensureZohoAccessToken(conn: { accessToken: string | null; refreshToken: string | null; expiresAt: Date | null; id: string }) {
  if (conn.accessToken && conn.expiresAt && conn.expiresAt.getTime() > Date.now() + 60_000) {
    return conn.accessToken;
  }
  if (!conn.refreshToken) throw new Error('Zoho refresh token missing — reconnect required');
  const res = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    body: new URLSearchParams({
      refresh_token: conn.refreshToken,
      client_id: process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Zoho refresh ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await prisma.accountingConnection.update({
    where: { id: conn.id },
    data: { accessToken: data.access_token, expiresAt },
  });
  return data.access_token;
}
