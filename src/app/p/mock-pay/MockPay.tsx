'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, ShieldCheck, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Mock payment gateway page. Used when RAZORPAY keys are absent.
 * Sequence: present "Pay" → mark Payment SUCCESS → redirect to /p/[token]?paid=1
 */
export function MockPay() {
  const router = useRouter();
  const sp = useSearchParams();
  const reference = sp.get('ref'); // payment id we stored
  const back = sp.get('back') ?? '/';
  const [stage, setStage] = React.useState<'idle' | 'processing' | 'done' | 'failed'>('idle');

  async function pay() {
    if (!reference) {
      setStage('failed');
      return;
    }
    setStage('processing');
    try {
      // Tell the server we paid (simulates Razorpay webhook in mock mode)
      const res = await fetch('/api/mock-pay/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: reference }),
      });
      if (!res.ok) throw new Error('confirm failed');
      // brief delay so the UX feels like a real gateway
      await new Promise((r) => setTimeout(r, 700));
      setStage('done');
      setTimeout(() => router.replace(`${back}${back.includes('?') ? '&' : '?'}paid=1`), 900);
    } catch {
      setStage('failed');
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-6">
      <div className="aurora" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="card p-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              Avantus Test Gateway
            </span>
          </div>

          <h1 className="text-2xl font-semibold">Confirm payment</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            This is a sandbox payment page used when no Razorpay credentials are configured.
            In production the user would see Razorpay&apos;s real checkout here.
          </p>

          <div className="mt-6 rounded-xl border bg-[var(--color-surface-2)] p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">Reference</span>
              <code className="text-xs">{reference?.slice(-12) ?? '—'}</code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-muted)]">Method</span>
              <span>UPI / Card (simulated)</span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {stage === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
                <Button onClick={pay} fullWidth>
                  <CreditCard className="h-4 w-4" /> Pay now
                </Button>
                <p className="mt-3 text-xs text-center text-[var(--color-muted)]">
                  No real money will move. Vendor receives a SUCCESS webhook.
                </p>
              </motion.div>
            )}
            {stage === 'processing' && (
              <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--color-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Processing…
              </motion.div>
            )}
            {stage === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-6 w-6" />
                </div>
                <p className="mt-2 font-medium">Payment successful</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Returning to your portal…</p>
              </motion.div>
            )}
            {stage === 'failed' && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-sm text-red-400">
                Could not complete payment. Close this tab and try again.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  );
}
