import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

/**
 * Persistent banner shown on /app (and friends) when the AI onboarding hasn't
 * been completed yet. Server-rendered; no client state needed since we just
 * gate on tenant.onboardingCompletedAt.
 */
export function OnboardingBanner({ businessName }: { businessName: string }) {
  return (
    <Link
      href="/app/onboarding"
      className="group mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-primary)]/40 bg-gradient-to-r from-[var(--color-primary)]/15 via-transparent to-[var(--color-accent)]/15 p-4 transition hover:border-[var(--color-primary)]"
    >
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">Set up {businessName} in 5 minutes — with AI</div>
        <div className="text-xs text-[var(--color-muted)]">
          Tell me about your business, I'll draft your proposal template, contract, catalog & tone. Review anything before it saves.
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary)] group-hover:gap-2 transition-all">
        Start <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
