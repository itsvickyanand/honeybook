/**
 * Setup wizard — the new-tenant onboarding page.
 *
 * Step completion is *derived* from existing data, not stored separately, so
 * no schema migration is needed:
 *   - Choose plan         → tenant exists (always done; here for parity with HB)
 *   - Add services        → tenant has any CustomTable rows (the services catalog)
 *   - Customize pipeline  → tenant has any non-default Pipeline OR any Stage edited
 *   - Import client list  → tenant has > 1 Contact (the seeded sample counts as 1)
 *   - Create first project→ tenant has any Project
 *   - Send a proposal     → tenant has any Proposal in status SENT/VIEWED/SIGNED/etc.
 *   - Connect integration → tenant has any AccountingConnection or calendar event
 */
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  Sparkles,
  Search,
  Palette,
  PlugZap,
  ArrowRight,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';

interface Step {
  id: string;
  title: string;
  blurb: string;
  done: boolean;
  cta: string;
  href: string;
  timeMin: number;
}

export default async function SetupPage() {
  const ctx = await requireContext();
  const tenantId = ctx.tenant.id;

  const [
    servicesCount,
    pipelineCount,
    contactCount,
    projectCount,
    sentProposalCount,
    accountingCount,
    brandComplete,
  ] = await Promise.all([
    prisma.customRow.count({ where: { table: { tenantId } } }),
    prisma.pipeline.count({ where: { tenantId, isDefault: false } }),
    prisma.contact.count({ where: { tenantId } }),
    prisma.project.count({ where: { tenantId } }),
    prisma.proposal.count({
      where: { tenantId, status: { in: ['SENT', 'VIEWED', 'ACCEPTED'] } },
    }),
    prisma.accountingConnection.count({ where: { tenantId } }),
    Promise.resolve(Boolean(ctx.tenant.logoUrl)),
  ]);

  const steps: Step[] = [
    {
      id: 'plan',
      title: 'Choose your plan',
      blurb: 'Pick a plan that fits your workflow and business goals.',
      done: true, // tenant exists ⇒ implicitly chose during signup
      cta: 'Review plans',
      href: '/app/settings/workspace',
      timeMin: 3,
    },
    {
      id: 'services',
      title: 'Add your services to the hub',
      blurb: `List your ${ctx.tenant.businessType.name.toLowerCase()} offerings for easy use in proposals and invoices.`,
      done: servicesCount > 0,
      cta: servicesCount > 0 ? 'Manage services' : 'Add services',
      href: '/app/catalog',
      timeMin: 5,
    },
    {
      id: 'pipeline',
      title: 'Customize your pipeline',
      blurb: 'Tailor pipeline stages to match how you manage orders and events.',
      done: pipelineCount > 0,
      cta: pipelineCount > 0 ? 'Edit stages' : 'Customize pipeline',
      href: '/app/leads',
      timeMin: 4,
    },
    {
      id: 'clients',
      title: 'Import your client list',
      blurb: 'Bring in existing contacts so you can start working with real clients right away.',
      done: contactCount > 1,
      cta: contactCount > 1 ? 'Manage clients' : 'Import clients',
      href: '/app/contacts',
      timeMin: 5,
    },
    {
      id: 'project',
      title: 'Create your first project',
      blurb: 'Set up a real or sample order to see how the platform keeps everything organized.',
      done: projectCount > 0,
      cta: projectCount > 0 ? 'Open projects' : 'Create project',
      href: '/app/projects',
      timeMin: 3,
    },
    {
      id: 'proposal',
      title: 'Send a proposal',
      blurb: 'Build and send a branded proposal to a client to streamline booking and payment.',
      done: sentProposalCount > 0,
      cta: sentProposalCount > 0 ? 'See proposals' : 'New proposal',
      href: sentProposalCount > 0 ? '/app/proposals' : '/app/proposals/new',
      timeMin: 10,
    },
    {
      id: 'integration',
      title: 'Connect an integration',
      blurb: 'Sync calendar and accounting so nothing slips through the cracks.',
      done: accountingCount > 0,
      cta: accountingCount > 0 ? 'Manage integrations' : 'Connect',
      href: '/app/settings/integrations',
      timeMin: 4,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const progressPct = Math.round((completed / steps.length) * 100);

  const integrations = [
    { name: 'Google Calendar', env: 'GOOGLE_CLIENT_ID', connected: false },
    { name: 'Zoho', env: 'ZOHO_CLIENT_ID', connected: accountingCount > 0 },
    { name: 'Razorpay', env: 'RAZORPAY_KEY_ID', connected: false },
    { name: 'Resend', env: 'RESEND_API_KEY', connected: false },
    { name: 'WhatsApp', env: 'WHATSAPP_TOKEN', connected: false },
    { name: 'GST IRP', env: 'GST_IRP_KEY', connected: false },
  ];

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--color-primary)]" />
              Let&apos;s start step-by-step
            </h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">
              Get {ctx.tenant.name} running on the platform in about 30 minutes.
            </p>
          </div>
          <div className="relative">
            <input
              placeholder="Search"
              className="input-base pl-9 pr-3 py-2 w-56 text-sm"
              aria-label="Search"
            />
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main checklist column */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-medium">
                {completed}/{steps.length} completed
              </div>
              <div className="flex-1 max-w-md ml-6">
                <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            <ul className="space-y-2">
              {steps.map((step) => (
                <li key={step.id}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-4 rounded-xl border bg-[var(--color-surface-2)]/40 px-4 py-4 transition-all hover:bg-[var(--color-surface-2)] hover:border-[var(--color-primary)]/40"
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-[var(--color-muted)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={step.done ? 'font-medium line-through text-[var(--color-muted)]' : 'font-medium'}>
                          {step.title}
                        </div>
                        <span className="text-xs text-[var(--color-muted)]">{step.timeMin} mins</span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] mt-0.5">{step.blurb}</p>
                    </div>
                    <span className="text-xs text-[var(--color-muted)] hidden sm:inline">{step.cta}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Right rail */}
          <div className="space-y-6">
            {/* Brand elements */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[var(--color-primary)]" />
                  Brand elements
                </h2>
                <Link
                  href="/app/settings/workspace"
                  className="text-xs text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
                >
                  Edit <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-xl flex items-center justify-center border text-xs text-[var(--color-muted)] overflow-hidden"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {ctx.tenant.logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={ctx.tenant.logoUrl} alt="Logo" className="h-full w-full object-cover" />
                  ) : (
                    'Logo'
                  )}
                </div>
                <div
                  className="h-12 w-12 rounded-xl"
                  style={{ background: ctx.tenant.brandColor }}
                  aria-label={`Brand color ${ctx.tenant.brandColor}`}
                />
                <div
                  className="h-12 w-12 rounded-xl border flex items-center justify-center text-xs font-semibold"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  {ctx.tenant.name.charAt(0).toUpperCase()}
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted)] mt-3">
                {brandComplete
                  ? 'Brand elements are ready — these appear on proposals, invoices, and the client portal.'
                  : 'Add a logo and choose your brand color so it shows on every client-facing document.'}
              </p>
            </div>

            {/* Integrations */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold flex items-center gap-2">
                  <PlugZap className="h-4 w-4 text-[var(--color-primary)]" />
                  Integrations
                </h2>
                <Link
                  href="/app/settings/integrations"
                  className="text-xs text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
                >
                  All <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <ul className="grid grid-cols-2 gap-2">
                {integrations.map((it) => (
                  <li
                    key={it.name}
                    className="flex items-center gap-2 rounded-lg border bg-[var(--color-surface-2)]/40 px-2.5 py-2 text-xs"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        it.connected ? 'bg-emerald-400' : 'bg-[var(--color-muted)]/40'
                      }`}
                      aria-label={it.connected ? 'Connected' : 'Not connected'}
                    />
                    <span className="truncate">{it.name}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Next-best-action */}
            {completed < steps.length && (
              <div className="card p-5 relative overflow-hidden">
                <div
                  className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl"
                  style={{ background: ctx.tenant.businessType.accentColor }}
                />
                <div className="relative">
                  <div className="text-xs text-[var(--color-muted)] mb-1">Up next</div>
                  {(() => {
                    const next = steps.find((s) => !s.done)!;
                    return (
                      <>
                        <div className="font-medium mb-1">{next.title}</div>
                        <p className="text-xs text-[var(--color-muted)] mb-3">{next.blurb}</p>
                        <Link href={next.href} className="btn-primary text-sm py-2 px-3 w-full">
                          {next.cta} <ArrowRight className="h-4 w-4" />
                        </Link>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
