'use client';
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { PenSquare, ShieldCheck, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Mock eSign page used when DIGIO credentials are absent.
 * Sequence: present consent → mark SignatureRequest SIGNED → redirect with ?signed=1
 */
export function MockSign() {
  const router = useRouter();
  const sp = useSearchParams();
  const reference = sp.get('ref');
  const back = sp.get('back') ?? '/';
  const [agree, setAgree] = React.useState(false);
  const [stage, setStage] = React.useState<'idle' | 'processing' | 'done' | 'failed'>('idle');

  async function sign() {
    if (!reference) return setStage('failed');
    setStage('processing');
    try {
      const res = await fetch('/api/mock-sign/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: reference }),
      });
      if (!res.ok) throw new Error('confirm failed');
      await new Promise((r) => setTimeout(r, 700));
      setStage('done');
      setTimeout(() => router.replace(`${back}${back.includes('?') ? '&' : '?'}signed=1`), 900);
    } catch {
      setStage('failed');
    }
  }

  return (
    <main className="min-h-screen relative overflow-hidden flex items-center justify-center p-6">
      <div className="aurora" />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 w-full max-w-md">
        <div className="card p-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
              Avantus Test eSign
            </span>
          </div>

          <h1 className="text-2xl font-semibold">Sign agreement</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Sandbox signing page. In production this is Digio Aadhaar eSign.
          </p>

          <label className="mt-6 flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm text-[var(--color-muted)]">
              I have read the proposal and agree to the terms presented in it. I confirm that
              I am authorized to sign this on behalf of the client.
            </span>
          </label>

          <AnimatePresence mode="wait">
            {stage === 'idle' && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6">
                <Button onClick={sign} disabled={!agree} fullWidth>
                  <PenSquare className="h-4 w-4" /> Sign with Aadhaar (mock)
                </Button>
              </motion.div>
            )}
            {stage === 'processing' && (
              <motion.div key="proc" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 flex items-center justify-center gap-2 text-sm text-[var(--color-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </motion.div>
            )}
            {stage === 'done' && (
              <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 text-center">
                <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Check className="h-6 w-6" />
                </div>
                <p className="mt-2 font-medium">Signed</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">Returning to your portal…</p>
              </motion.div>
            )}
            {stage === 'failed' && (
              <motion.div key="failed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-center text-sm text-red-400">
                Signature could not be recorded.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </main>
  );
}
