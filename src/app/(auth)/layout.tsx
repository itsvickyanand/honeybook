import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex flex-col">
      <div className="aurora" />
      <header className="relative z-10 mx-auto w-full max-w-7xl px-6 py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]">
            <Sparkles className="h-4 w-4" />
          </span>
          Avantus
        </Link>
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16">
        {children}
      </div>
    </main>
  );
}
