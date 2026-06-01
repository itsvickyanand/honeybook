import Link from 'next/link';
import {
  Building2, Users, Plug, Shield, MessageSquare, Mail, ListChecks, FileDown,
  KeyRound, Layout, Sparkles, Webhook, ScrollText,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { PageTransition } from '@/components/dashboard/PageTransition';

export default async function SettingsPage() {
  const ctx = await requireContext();
  const cards: { href: string; title: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { href: '/app/settings/workspace', title: 'Workspace', description: 'Name, tax, currency, brand color, logo, region', icon: Building2 },
    { href: '/app/settings/team', title: 'Members', description: 'Invite people, set roles, suspend', icon: Users },
    { href: '/app/settings/teams', title: 'Teams', description: 'Group members into teams, set leads, move people', icon: Users },
    { href: '/app/settings/roles', title: 'Roles & permissions', description: 'Custom roles with per-permission toggles', icon: Shield },
    { href: '/app/settings/contracts', title: 'Contracts', description: 'Write your own agreements with merge fields, set a default', icon: ScrollText },
    { href: '/app/settings/scheduling', title: 'Scheduling', description: 'Meeting types + weekly availability for client bookings', icon: Building2 },
    { href: '/app/settings/security', title: 'Security', description: 'Two-factor authentication, sessions', icon: Shield },
    { href: '/app/settings/integrations', title: 'Integrations', description: 'Zoho, Google Calendar, Tally, payments, eSign', icon: Plug },
    { href: '/app/settings/whatsapp', title: 'WhatsApp templates', description: 'Manage approved Meta templates', icon: MessageSquare },
    { href: '/app/settings/ai', title: 'AI configuration', description: 'Tone, upsell, mandatory items, custom instructions', icon: Sparkles },
    { href: '/app/settings/portal', title: 'Portal builder', description: 'Sections, theme colors, preview', icon: Layout },
    { href: '/app/settings/lead-scoring', title: 'Lead scoring rules', description: 'Add/subtract points based on lead fields', icon: ListChecks },
    { href: '/app/settings/drips', title: 'Email sequences', description: 'Automated follow-ups by trigger', icon: Mail },
    { href: '/app/settings/audit', title: 'Audit log', description: 'Every write to your workspace', icon: ScrollText },
    { href: '/app/settings/api-keys', title: 'API keys + webhooks', description: 'Build integrations on top of your data', icon: KeyRound },
    { href: '/api/workspace/export', title: 'Export workspace', description: 'Download a JSON backup of everything', icon: FileDown },
    { href: '#', title: 'Outbound webhooks', description: 'Coming soon — subscribe to events', icon: Webhook },
  ];

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            {ctx.tenant.name} · {ctx.tenant.businessType.name}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.href + c.title}
                href={c.href}
                className="card p-5 hover:border-[var(--color-primary)]/60 transition group"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-accent)]/20 mb-3">
                  <Icon className="h-5 w-5 text-[var(--color-primary-soft)]" />
                </div>
                <h3 className="font-semibold group-hover:text-[var(--color-primary-soft)] transition">{c.title}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{c.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </PageTransition>
  );
}
