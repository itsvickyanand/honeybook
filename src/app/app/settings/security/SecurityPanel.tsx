'use client';
import * as React from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function SecurityPanel({ enabled: initial }: { enabled: boolean }) {
  const [enabled, setEnabled] = React.useState(initial);
  const [secret, setSecret] = React.useState('');
  const [qr, setQr] = React.useState('');
  const [code, setCode] = React.useState('');
  const [recovery, setRecovery] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);

  async function enroll() {
    setBusy(true);
    try {
      const res = await fetch('/api/2fa/enroll', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSecret(data.secret);
      setQr(data.qr);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Invalid code');
      toast.success('2FA enabled');
      setEnabled(true);
      setRecovery(data.recoveryCodes);
      setSecret(''); setQr(''); setCode('');
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function disable() {
    if (!confirm('Disable 2FA?')) return;
    const res = await fetch('/api/2fa/disable', { method: 'POST' });
    if (!res.ok) return toast.error('Failed');
    setEnabled(false);
    toast.success('2FA disabled');
  }

  if (recovery.length > 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 card p-6">
        <h2 className="font-semibold">Save your recovery codes</h2>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          Each can be used once if you lose your authenticator app. They won&apos;t be shown again.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {recovery.map((c) => (
            <div key={c} className="rounded border bg-[var(--color-surface-2)] p-2 text-center">{c}</div>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(recovery.join('\n')); toast.success('Copied'); }}>
            Copy all
          </Button>
          <Button onClick={() => setRecovery([])}>Done</Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 card p-6">
      <div className="flex items-center gap-3">
        {enabled ? <ShieldCheck className="h-5 w-5 text-emerald-400" /> : <ShieldOff className="h-5 w-5 text-[var(--color-muted)]" />}
        <div className="flex-1">
          <div className="font-semibold">Two-factor authentication (TOTP)</div>
          <div className="text-sm text-[var(--color-muted)]">
            {enabled ? 'Active — your account requires a code at login.' : 'Add a second factor for stronger account security.'}
          </div>
        </div>
        {enabled ? (
          <Button variant="danger" onClick={disable}>Disable</Button>
        ) : !secret ? (
          <Button onClick={enroll} loading={busy}>Set up</Button>
        ) : null}
      </div>

      {secret && (
        <div className="mt-6 border-t pt-6 space-y-4">
          <p className="text-sm text-[var(--color-muted)]">Scan with Google Authenticator, 1Password, Authy, etc.</p>
          {qr && <Image src={qr} alt="QR" width={160} height={160} className="rounded-xl border" unoptimized />}
          <p className="text-xs text-[var(--color-muted)] font-mono break-all">Secret: {secret}</p>
          <Input
            label="Enter 6-digit code from your app"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            inputMode="numeric"
          />
          <Button onClick={verify} loading={busy} disabled={code.length !== 6}>Verify & enable</Button>
        </div>
      )}
    </motion.div>
  );
}
