import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mail, Phone, Building2, Sparkles, FileText, Receipt, MessageSquare } from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { formatCurrency, timeAgo } from '@/lib/utils';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const contact = await prisma.contact.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      proposals: { orderBy: { createdAt: 'desc' } },
      leads: { include: { stage: true } },
      activities: { orderBy: { createdAt: 'desc' } },
      chatThreads: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } } },
    },
  });
  if (!contact) notFound();

  const invoices = await prisma.invoice.findMany({
    where: { tenantId: ctx.tenant.id, contactId: contact.id },
    orderBy: { createdAt: 'desc' },
  });

  // Build a unified timeline
  type T = { at: Date; kind: string; title: string; subtitle?: string; href?: string };
  const items: T[] = [];
  for (const a of contact.activities) items.push({ at: a.createdAt, kind: a.type, title: a.title, subtitle: a.body ?? undefined });
  for (const p of contact.proposals) items.push({ at: p.createdAt, kind: 'Proposal', title: p.title, subtitle: `${p.status} · ${formatCurrency(p.total, ctx.tenant.currency, ctx.tenant.locale)}`, href: `/app/proposals/${p.id}` });
  for (const inv of invoices) items.push({ at: inv.createdAt, kind: 'Invoice', title: inv.number ?? '— draft', subtitle: `${inv.status} · ${formatCurrency(inv.total, ctx.tenant.currency, ctx.tenant.locale)}`, href: `/app/invoices/${inv.id}` });
  for (const t of contact.chatThreads) {
    const m = t.messages[0];
    if (m) items.push({ at: m.createdAt, kind: t.channel, title: 'Message', subtitle: m.body });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <Link href="/app/contacts" className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to clients
        </Link>

        <div className="card p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-lg font-semibold">
              {contact.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">{contact.fullName}</h1>
              {contact.company && <div className="text-sm text-[var(--color-muted)]">{contact.company}</div>}
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-[var(--color-muted)]">
                {contact.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {contact.email}</span>}
                {contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {contact.phone}</span>}
                {contact.source && <span className="chip">{contact.source}</span>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--color-muted)]">Lifetime value</div>
              <div className="text-xl font-semibold mt-1">
                {formatCurrency(invoices.filter((i) => i.status === 'PAID').reduce((t, i) => t + i.total, 0), ctx.tenant.currency, ctx.tenant.locale)}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-semibold mb-4">Activity</h2>
          {items.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)] text-center py-8">No activity yet.</p>
          ) : (
            <ul className="relative space-y-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-[var(--color-border)]">
              {items.slice(0, 50).map((it, i) => {
                const Icon = it.kind === 'Proposal' ? FileText : it.kind === 'Invoice' ? Receipt : it.kind === 'PORTAL' || it.kind === 'WHATSAPP' || it.kind === 'EMAIL' ? MessageSquare : Sparkles;
                return (
                  <li key={i} className="relative pl-8">
                    <div className="absolute left-0 top-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-surface-2)] border">
                      <Icon className="h-3.5 w-3.5 text-[var(--color-primary-soft)]" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="chip text-xs">{it.kind}</span>
                      {it.href ? (
                        <Link href={it.href} className="font-medium hover:text-[var(--color-primary-soft)]">{it.title}</Link>
                      ) : (
                        <span className="font-medium">{it.title}</span>
                      )}
                      <span className="text-xs text-[var(--color-muted)] ml-auto">{timeAgo(it.at)}</span>
                    </div>
                    {it.subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{it.subtitle}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
