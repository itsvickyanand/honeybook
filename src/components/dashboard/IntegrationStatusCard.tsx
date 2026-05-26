import Link from 'next/link';
import {
  Sparkles, Mail, Phone, MessageSquare, CreditCard, PenSquare, FileText,
  BookText, Calendar as CalendarIcon, Database, CheckCircle2, AlertCircle,
  ArrowUpRight,
} from 'lucide-react';
import { integrationStatus } from '@/lib/feature-flags';

interface Row {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  configured: boolean;
}

/**
 * Always-visible integration status grid on the dashboard.
 * Shows which providers are real (live keys present) vs running in mock mode.
 */
export function IntegrationStatusCard() {
  const s = integrationStatus();
  const rows: Row[] = [
    { key: 'ai',             label: 'Claude (AI)',     icon: Sparkles,       configured: s.ai },
    { key: 'embeddings',     label: 'Embeddings',      icon: Database,       configured: s.embeddings },
    { key: 'email',          label: 'Email',           icon: Mail,           configured: s.email },
    { key: 'sms',            label: 'SMS',             icon: Phone,          configured: s.sms },
    { key: 'whatsapp',       label: 'WhatsApp',        icon: MessageSquare,  configured: s.whatsapp },
    { key: 'payments',       label: 'Razorpay',        icon: CreditCard,     configured: s.payments },
    { key: 'esign',          label: 'eSign',           icon: PenSquare,      configured: s.esign },
    { key: 'gstIrp',         label: 'GST IRN',         icon: FileText,       configured: s.gstIrp },
    { key: 'zoho',           label: 'Zoho Books',      icon: BookText,       configured: s.zoho },
    { key: 'googleCalendar', label: 'Google Calendar', icon: CalendarIcon,   configured: s.googleCalendar },
  ];
  const configured = rows.filter((r) => r.configured).length;
  const total = rows.length;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold">Integrations</h2>
          <p className="text-xs text-[var(--color-muted)] mt-0.5">
            {configured} of {total} configured · {total - configured} running in mock mode
          </p>
        </div>
        <Link
          href="/app/settings/integrations"
          className="text-sm text-[var(--color-muted)] hover:text-white inline-flex items-center gap-1"
        >
          Manage <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.key}
              className={`rounded-xl border p-3 transition ${
                r.configured
                  ? 'bg-emerald-500/5 border-emerald-500/30'
                  : 'bg-amber-500/5 border-amber-500/30'
              }`}
              title={r.configured ? 'Live keys configured' : 'Running in mock mode — add keys in .env'}
            >
              <div className="flex items-start gap-2">
                <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${r.configured ? 'text-emerald-400' : 'text-amber-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.label}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {r.configured ? (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-300">Live</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 text-amber-300" />
                        <span className="text-amber-200">Mock</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
