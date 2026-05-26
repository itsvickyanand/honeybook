'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface BusinessType {
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
}

export function SignupForm({ businessTypes }: { businessTypes: BusinessType[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [businessTypeSlug, setBusinessTypeSlug] = React.useState('');
  const [businessName, setBusinessName] = React.useState('');
  const [ownerFullName, setOwnerFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const selectedBt = businessTypes.find((b) => b.slug === businessTypeSlug);

  async function submit() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          businessName,
          businessTypeSlug,
          ownerFullName,
          email,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Signup failed');
      toast.success('Account created — taking you to your dashboard');
      router.push('/app');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl"
    >
      <div className="card p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Create your workspace</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Step {step + 1} of 3</p>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1.5 w-8 rounded-full transition-all ${
                  i <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              <p className="mb-4 text-sm text-[var(--color-muted)]">
                Pick the business type — we&apos;ll pre-build the right item master for you.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {businessTypes.map((b) => (
                  <button
                    key={b.slug}
                    type="button"
                    onClick={() => setBusinessTypeSlug(b.slug)}
                    className={`text-left card p-4 transition-all hover:-translate-y-0.5 ${
                      businessTypeSlug === b.slug
                        ? 'ring-2 ring-[var(--color-primary)]'
                        : 'hover:border-[var(--color-primary)]/40'
                    }`}
                    style={
                      businessTypeSlug === b.slug
                        ? { boxShadow: `0 0 40px -20px ${b.accentColor}` }
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white"
                        style={{ background: b.accentColor }}
                      >
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold">{b.name}</div>
                        <div className="mt-1 text-xs text-[var(--color-muted)]">{b.description}</div>
                      </div>
                      {businessTypeSlug === b.slug && (
                        <Check className="h-5 w-5 text-[var(--color-primary)]" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <Button
                  disabled={!businessTypeSlug}
                  onClick={() => setStep(1)}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="card p-3 mb-2 flex items-center gap-3"
                   style={{ borderColor: (selectedBt?.accentColor ?? '#fff') + '55' }}>
                <div
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
                  style={{ background: selectedBt?.accentColor }}
                >
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{selectedBt?.name}</div>
                  <div className="text-xs text-[var(--color-muted)]">{selectedBt?.description}</div>
                </div>
              </div>
              <Input
                label="Business name"
                placeholder="e.g. Aurelia Catering Co."
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
              />
              <Input
                label="Your full name"
                placeholder="Jane Doe"
                value={ownerFullName}
                onChange={(e) => setOwnerFullName(e.target.value)}
              />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  disabled={!businessName.trim() || !ownerFullName.trim()}
                  onClick={() => setStep(2)}
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <Input
                label="Work email"
                type="email"
                placeholder="you@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <Input
                label="Password"
                type="password"
                hint="Min 8 characters."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <Button
                  loading={loading}
                  disabled={!email || password.length < 8}
                  onClick={submit}
                >
                  Create account <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-sm text-[var(--color-muted)]">
          Already have an account?{' '}
          <Link href="/login" className="text-[var(--color-primary-soft)] hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
