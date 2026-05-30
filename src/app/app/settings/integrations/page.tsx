import Link from 'next/link';
import {
  CheckCircle2, AlertCircle, ArrowUpRight, FileText, MessageSquare,
  CreditCard, PenSquare, BookText, Calendar as CalendarIcon, Mail, Phone, Database,
} from 'lucide-react';
import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { integrationStatus } from '@/lib/feature-flags';

export default async function IntegrationsPage() {
  const ctx = await requireContext();
  const status = integrationStatus();
  const connections = await prisma.accountingConnection.findMany({
    where: { tenantId: ctx.tenant.id },
  });
  const connByProvider = new Map(connections.map((c) => [c.provider, c]));

  const rows: {
    key: string; name: string; description: string; icon: React.ComponentType<{ className?: string }>;
    configured: boolean; connectHref?: string; docsHref?: string;
    secondaryStatus?: string;
  }[] = [
    {
      key: 'claude', name: 'Claude (Anthropic)', description: 'AI proposal generation.',
      icon: Database, configured: status.ai,
      docsHref: 'https://console.anthropic.com/',
    },
    {
      key: 'embeddings', name: 'Embeddings (Voyage / OpenAI)', description: 'Semantic catalog retrieval.',
      icon: Database, configured: status.embeddings,
      docsHref: 'https://docs.voyageai.com/',
    },
    {
      key: 'razorpay', name: 'Razorpay', description: 'Payment links + UPI + cards (India).',
      icon: CreditCard, configured: status.payments,
      docsHref: 'https://dashboard.razorpay.com/',
    },
    {
      key: 'digio', name: 'Digio eSign', description: 'Aadhaar / DSC signing (India).',
      icon: PenSquare, configured: status.esign,
      docsHref: 'https://app.digio.in/',
    },
    {
      key: 'resend', name: 'Resend', description: 'Transactional email.',
      icon: Mail, configured: status.email,
      docsHref: 'https://resend.com/',
    },
    {
      key: 'whatsapp', name: 'WhatsApp Business', description: 'Template messages + 2-way chat.',
      icon: MessageSquare, configured: status.whatsapp,
      docsHref: 'https://developers.facebook.com/docs/whatsapp/',
    },
    {
      key: 'msg91', name: 'MSG91', description: 'SMS + OTP (India). DLT templates required.',
      icon: Phone, configured: status.sms,
      docsHref: 'https://msg91.com/',
    },
    {
      key: 'zoho', name: 'Zoho Books', description: 'Auto-sync invoices, receipts, contacts.',
      icon: BookText, configured: status.zoho,
      connectHref: connByProvider.has('zoho') ? undefined : '/api/accounting/zoho/connect',
      secondaryStatus: connByProvider.get('zoho')?.status,
    },
    {
      key: 'google-calendar', name: 'Google Calendar', description: 'Bidirectional event sync.',
      icon: CalendarIcon, configured: status.googleCalendar,
      connectHref: connByProvider.has('google_calendar') ? undefined : '/api/calendar/google/connect',
      secondaryStatus: connByProvider.get('google_calendar')?.status,
    },
    {
      key: 'tally', name: 'TallyPrime (Desktop Agent)', description: 'Push invoices to Tally via local agent.',
      icon: FileText, configured: connByProvider.has('tally'),
    },
    {
      key: 'gst', name: 'GST IRP (e-invoicing)', description: 'IRN + QR for invoices above threshold.',
      icon: FileText, configured: status.gstIrp,
    },
  ];

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">Integrations</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Connect external services. When an integration isn&apos;t configured we run a mock so the flow still works.
          </p>
        </div>

        <div className="space-y-3">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.key} className="card p-5 flex items-start gap-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-surface-2)]">
                  <Icon className="h-5 w-5 text-[var(--color-primary-soft)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    {r.configured ? (
                      <span className="chip bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span className="chip bg-amber-500/20 text-amber-300 border-amber-500/40">
                        <AlertCircle className="h-3 w-3" /> Mock mode
                      </span>
                    )}
                    {r.secondaryStatus && r.secondaryStatus !== 'CONNECTED' && (
                      <span className="chip">{r.secondaryStatus}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{r.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.connectHref && (
                    <Link href={r.connectHref} className="btn-primary">
                      Connect
                    </Link>
                  )}
                  {r.docsHref && (
                    <Link href={r.docsHref} target="_blank" className="btn-ghost text-sm">
                      Docs <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 card p-5 bg-[var(--color-surface-2)] text-sm text-[var(--color-muted)]">
          Add API keys to <code>.env</code> and restart the dev server. Production deploys pull these from your hosting provider&apos;s secret manager.
        </div>
      </div>
    </PageTransition>
  );
}
