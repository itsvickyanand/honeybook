'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

export function PayInvoice({
  token, status, balance, currency, locale,
}: {
  token: string;
  status: string;
  balance: number;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const justPaid = sp.get('paid') === '1';
  const [loading, setLoading] = React.useState(false);
  const [polling, setPolling] = React.useState(justPaid && status !== 'PAID');

  // After redirect back from Razorpay, poll until the payment reflects.
  React.useEffect(() => {
    if (!justPaid || status === 'PAID') return;
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/i/${token}/status`);
        const data = await res.json();
        if (data.invoice?.status === 'PAID' || data.invoice?.amountPaid > 0) {
          clearInterval(iv);
          setPolling(false);
          router.refresh();
        }
      } catch { /* keep trying */ }
      if (tries >= 8) { clearInterval(iv); setPolling(false); }
    }, 2000);
    return () => clearInterval(iv);
  }, [justPaid, status, token, router]);

  if (status === 'PAID' || balance <= 0) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-500">
        <CheckCircle2 className="h-5 w-5" /> Paid in full — thank you!
      </div>
    );
  }

  async function pay() {
    setLoading(true);
    try {
      const res = await fetch(`/api/i/${token}/pay`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.error || 'Could not start payment');
      if (data.alreadyPaid) { router.refresh(); return; }
      window.location.href = data.payUrl;
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {polling && (
        <div className="mb-3 flex items-center justify-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Confirming your payment…
        </div>
      )}
      <Button onClick={pay} loading={loading} fullWidth>
        <CreditCard className="h-4 w-4" /> Pay {formatCurrency(balance, currency, locale)}
      </Button>
      <p className="mt-2 text-center text-xs text-[var(--color-muted)]">UPI · Card · Net Banking via Razorpay</p>
    </div>
  );
}
