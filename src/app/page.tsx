import Link from 'next/link';
import {
  Sparkles,
  Database,
  FileText,
  Layers,
  Wand2,
  ArrowRight,
} from 'lucide-react';
import { prisma } from '@/lib/db';

export default async function Home() {
  const businessTypes = await prisma.businessType.findMany({ orderBy: { name: 'asc' } });

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="aurora" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]">
            <Sparkles className="h-4 w-4" />
          </span>
          Avantus
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className="btn-ghost">
            Log in
          </Link>
          <Link href="/signup" className="btn-primary">
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-5xl px-6 pt-16 pb-24 text-center">
        <div className="chip mx-auto mb-6">
          <Sparkles className="h-3 w-3" />
          Multi-tenant · AI-curated · Wedding-cluster verticals
        </div>
        <h1 className="mx-auto max-w-4xl text-balance text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight">
          The platform service businesses{' '}
          <span className="bg-gradient-to-r from-[var(--color-primary-soft)] to-[var(--color-accent)] bg-clip-text text-transparent">
            send portals from, not PDFs.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-[var(--color-muted)]">
          Build your item master, generate AI-curated proposals from your catalog, and share
          editable client portals — all under one tenant, with roles, permissions, and
          GST-ready pricing built in.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary">
            Start free trial <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="btn-secondary">
            Try a demo account
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { icon: Layers, title: 'Multi-tenant + RBAC', text: 'One platform, your business, your team, your data.' },
            { icon: Database, title: 'Dynamic Item Master', text: 'Build your own tables and columns. CSV upload included.' },
            { icon: Wand2, title: 'AI Proposal Engine', text: 'Claude reads your catalog and drafts curated proposals.' },
            { icon: FileText, title: 'Editable Client Portal', text: 'Premium share-link with quantity edits and change requests.' },
          ].map((f, i) => (
            <div key={i} className="card p-5">
              <f.icon className="h-6 w-6 text-[var(--color-primary-soft)]" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-center text-2xl font-semibold mb-2">Built for these businesses</h2>
        <p className="text-center text-[var(--color-muted)] mb-10">
          Each vertical ships with a pre-built item master you can extend.
        </p>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {businessTypes.map((b) => (
            <div
              key={b.id}
              className="card p-5 text-center transition-transform hover:-translate-y-1"
              style={{
                borderColor: b.accentColor + '55',
                boxShadow: `0 0 60px -30px ${b.accentColor}`,
              }}
            >
              <div
                className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl text-white"
                style={{ background: b.accentColor }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{b.name}</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{b.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t py-8 text-center text-sm text-[var(--color-muted)]">
        © {new Date().getFullYear()} Avantus · Built as a reference implementation
      </footer>
    </main>
  );
}
