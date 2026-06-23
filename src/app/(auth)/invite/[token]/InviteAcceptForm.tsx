'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function InviteAcceptForm({
  token, email, tenantName, roleName, suggestedFullName,
}: {
  token: string;
  email: string;
  tenantName: string;
  roleName: string;
  suggestedFullName: string;
}) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState(suggestedFullName);
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fullName, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Welcome aboard');
      router.push('/app/setup');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
      <div className="card p-8">
        <h1 className="text-2xl font-semibold">Join {tenantName}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          You&apos;ve been invited as <strong>{roleName}</strong>.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Input label="Email" value={email} disabled />
          <Input label="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          <Input label="Password" type="password" hint="Min 8 chars." value={password} onChange={(e) => setPassword(e.target.value)} required />
          <Button type="submit" fullWidth loading={loading} disabled={password.length < 8 || !fullName}>
            Accept invitation
          </Button>
        </form>
      </div>
    </motion.div>
  );
}
