/**
 * Demo mode banner — surfaces when an integration is running on the platform's
 * fallback credentials instead of the tenant's own connection. Nudges the
 * vendor to connect their own account from Settings → Integrations.
 *
 * Server-rendered: pass an array of provider names that are currently in
 * demo-mode for the tenant. We hide the banner when the array is empty.
 */
import Link from 'next/link';
import { AlertCircle, ExternalLink } from 'lucide-react';

export function DemoModeBanner({ providers }: { providers: string[] }) {
  if (providers.length === 0) return null;
  const labels = providers.map(prettyName).join(', ');
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <div className="font-medium">
          Running in demo mode: {labels}
        </div>
        <p className="mt-1 text-amber-300/80">
          You&apos;re using shared platform credentials. Connect your own accounts so transactions and messages run under your business, not the platform&apos;s.
        </p>
      </div>
      <Link
        href="/app/settings/integrations"
        className="btn-ghost shrink-0 text-xs text-amber-200"
      >
        Connect <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function prettyName(p: string): string {
  switch (p) {
    case 'razorpay': return 'Razorpay';
    case 'docusign': return 'DocuSign';
    case 'digio': return 'Digio';
    case 'resend': return 'Email (Resend)';
    case 'whatsapp_bsp': return 'WhatsApp';
    case 'msg91': return 'SMS (MSG91)';
    case 'gst_irp': return 'GST e-invoicing';
    case 'zoho_books': return 'Zoho Books';
    default: return p;
  }
}
