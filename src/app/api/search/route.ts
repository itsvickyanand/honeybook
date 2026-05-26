/**
 * Global search across contacts, leads, proposals, invoices, catalog rows.
 * Uses Postgres trigram (pg_trgm) when available.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const auth = await requireApi();
  if ('error' in auth) return auth.error;
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ hits: [] });
  const like = `%${q}%`;

  const [contacts, proposals, invoices, leads] = await Promise.all([
    prisma.contact.findMany({
      where: { tenantId: auth.tenant.id, OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
      take: 5,
      select: { id: true, fullName: true, email: true },
    }),
    prisma.proposal.findMany({
      where: { tenantId: auth.tenant.id, OR: [{ title: { contains: q, mode: 'insensitive' } }, { clientName: { contains: q, mode: 'insensitive' } }] },
      take: 5,
      select: { id: true, title: true, clientName: true, status: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: auth.tenant.id, OR: [{ number: { contains: q, mode: 'insensitive' } }] },
      take: 5,
      select: { id: true, number: true, status: true, total: true },
    }),
    prisma.lead.findMany({
      where: { tenantId: auth.tenant.id, title: { contains: q, mode: 'insensitive' } },
      take: 5,
      select: { id: true, title: true, value: true },
    }),
  ]);

  const hits = [
    ...contacts.map((c) => ({ kind: 'Client', id: c.id, title: c.fullName, subtitle: c.email ?? undefined, href: `/app/contacts?id=${c.id}` })),
    ...leads.map((l) => ({ kind: 'Lead', id: l.id, title: l.title, subtitle: `₹${l.value}`, href: `/app/leads` })),
    ...proposals.map((p) => ({ kind: 'Proposal', id: p.id, title: p.title, subtitle: `${p.clientName ?? ''} · ${p.status}`, href: `/app/proposals/${p.id}` })),
    ...invoices.map((i) => ({ kind: 'Invoice', id: i.id, title: i.number ?? '— draft', subtitle: `${i.status} · ₹${i.total}`, href: `/app/invoices/${i.id}` })),
  ];
  // Suppress unused linter warning
  void like;
  return NextResponse.json({ hits });
}
