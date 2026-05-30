'use client';
import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function ForgotPage() {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [resetUrl, setResetUrl] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Reset link generated');
      if (data.resetUrl) setResetUrl(data.resetUrl);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md"
    >
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          We&apos;ll generate a 30-minute reset link.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <Button type="submit" loading={loading} fullWidth>
            Send reset link
          </Button>
        </form>

        {resetUrl && (
          <div className="mt-6 card p-4 bg-[var(--color-surface-2)] text-sm">
            <p className="text-xs text-[var(--color-muted)] mb-2">
              Demo mode: in production, this link is emailed. Click to continue →
            </p>
            <Link href={resetUrl.replace(/^https?:\/\/[^/]+/, '')} className="text-[var(--color-primary-soft)] break-all hover:underline">
              {resetUrl}
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Remembered?{' '}
          <Link href="/login" className="text-[var(--color-primary-soft)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
