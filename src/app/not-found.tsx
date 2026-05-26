import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-6">
      <div className="aurora" />
      <div className="relative card p-10 text-center max-w-md">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          The link you followed doesn&apos;t lead anywhere.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex">
          Take me home
        </Link>
      </div>
    </main>
  );
}
