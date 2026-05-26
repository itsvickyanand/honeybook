'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const DEMO_ACCOUNTS = [
  { label: 'Catering', email: 'owner@catering.demo' },
  { label: 'Event Mgmt', email: 'owner@event-management.demo' },
  { label: 'Photography', email: 'owner@wedding-photography.demo' },
  { label: 'Planner', email: 'owner@wedding-planner.demo' },
  { label: 'Florist', email: 'owner@florist-decor.demo' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Login failed');
      toast.success('Welcome back');
      router.push('/app');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(d: { email: string }) {
    setEmail(d.email);
    setPassword('demo1234');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Welcome back. Pick up where you left off.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input
            label="Work email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="flex items-center justify-between text-sm">
            <Link href="/forgot" className="text-[var(--color-primary-soft)] hover:underline">
              Forgot password?
            </Link>
            <Link href="/signup" className="text-[var(--color-muted)] hover:text-white">
              Need an account?
            </Link>
          </div>
          <Button type="submit" loading={loading} fullWidth>
            Log in
          </Button>
        </form>

        <div className="mt-8 border-t pt-6">
          <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
            Demo accounts · password: demo1234
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((d) => (
              <button
                key={d.email}
                type="button"
                className="chip hover:border-[var(--color-primary)]/60 hover:text-white transition"
                onClick={() => fillDemo(d)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
