/**
 * Tally desktop-bridge endpoint.
 *
 * The Electron agent (not in this repo) polls this URL with the agent's
 * paired token. The server replies with queued XML envelopes the agent
 * pushes into TallyPrime over its local ODBC/XML interface.
 *
 * Spec:
 *   GET /api/accounting/tally/bridge?token=<agentToken>&since=<rfc3339>
 *     → 200 { envelopes: [{ id, xml, kind }] }
 *   POST /api/accounting/tally/bridge?token=<agentToken>
 *     body = { ack: [envelopeId], errors: [{id, error}] }
 *
 * Tenants pair an agent under Settings → Accounting → Tally. Token is per-tenant.
 * (Pairing endpoint is TODO; this file documents the protocol the agent expects.)
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  const conn = await prisma.accountingConnection.findFirst({
    where: { provider: 'tally', accessToken: token },
  });
  if (!conn) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  // Pull queued accounting sync envelopes for this tenant.
  const pending = await prisma.accountingSyncLog.findMany({
    where: { tenantId: conn.tenantId, provider: 'tally', status: 'PENDING' },
    take: 20,
  });
  // Each envelope is XML; for the stub we just shape the response.
  return NextResponse.json({
    envelopes: pending.map((p) => ({
      id: p.id,
      kind: p.entityType,
      xml: `<TALLY-${p.entityType.toUpperCase()} id="${p.entityId}">…stub xml…</TALLY-${p.entityType.toUpperCase()}>`,
    })),
  });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });
  const conn = await prisma.accountingConnection.findFirst({
    where: { provider: 'tally', accessToken: token },
  });
  if (!conn) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    ack?: string[];
    errors?: { id: string; error: string }[];
  } | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  if (body.ack?.length) {
    await prisma.accountingSyncLog.updateMany({
      where: { id: { in: body.ack }, tenantId: conn.tenantId },
      data: { status: 'OK' },
    });
  }
  for (const err of body.errors ?? []) {
    await prisma.accountingSyncLog.update({
      where: { id: err.id },
      data: { status: 'FAILED', error: err.error },
    });
  }
  return NextResponse.json({ ok: true });
}
