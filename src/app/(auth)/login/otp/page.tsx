'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function OtpLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [stage, setStage] = React.useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = React.useState(false);

  async function request() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setStage('code');
      if (data.devCode) toast.message(`Dev mode — your code is ${data.devCode}`, { duration: 15000 });
      else toast.success('Code sent to your phone');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      router.push('/app');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">Log in with OTP</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {stage === 'phone' ? 'We’ll text you a 6-digit code.' : `Enter the code sent to ${phone}.`}
        </p>

        {stage === 'phone' ? (
          <div className="mt-6 space-y-4">
            <Input
              label="Mobile number"
              type="tel"
              placeholder="+91 9XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
            />
            <Button onClick={request} loading={loading} disabled={phone.length < 8} fullWidth>
              Send code
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <Input
              label="6-digit code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
            <Button onClick={verify} loading={loading} disabled={code.length !== 6} fullWidth>
              Verify & log in
            </Button>
            <button
              type="button"
              onClick={() => setStage('phone')}
              className="w-full text-center text-xs text-[var(--color-muted)] hover:underline"
            >
              Change number
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          <Link href="/login" className="text-[var(--color-primary-soft)] hover:underline">
            Back to password login
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
