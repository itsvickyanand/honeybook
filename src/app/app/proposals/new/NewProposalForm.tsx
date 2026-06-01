'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Wand2, Sparkles, Database, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select } from '@/components/ui/Input';

const TEMPLATES: Record<string, string[]> = {
  default: [
    'Couple booking a 3-day wedding in Mumbai — Dec 12-14. 400 guests for the main wedding, 200 for sangeet, 150 for haldi. Vegetarian-leaning with some non-veg starters. Budget around 25-30 lakhs.',
    'Corporate annual day for a 250-person tech company. Venue is a 5-star hotel in Bengaluru. Need plated meal, full AV with LED wall, and a backline for a 4-piece band. Awards night theme.',
  ],
};

export function NewProposalForm({
  businessTypeName,
  accent,
  catalogTableCount,
  contacts,
  templates,
  hasAiKey,
}: {
  businessTypeName: string;
  accent: string;
  catalogTableCount: number;
  contacts: { id: string; fullName: string; email: string | null }[];
  templates: { id: string; name: string; isDefault: boolean }[];
  hasAiKey: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [clientName, setClientName] = React.useState('');
  const [clientEmail, setClientEmail] = React.useState('');
  const [contactId, setContactId] = React.useState('');
  const [brief, setBrief] = React.useState('');
  const [proposalTemplateId, setProposalTemplateId] = React.useState(
    templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? ''
  );
  const [loading, setLoading] = React.useState(false);

  function pickContact(id: string) {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c) {
      setClientName(c.fullName);
      setClientEmail(c.email ?? '');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title || `Proposal for ${clientName}`,
          clientName,
          clientEmail: clientEmail || undefined,
          contactId: contactId || undefined,
          brief,
          proposalTemplateId: proposalTemplateId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      toast.success('Proposal drafted — review it now');
      router.push(`/app/proposals/${data.proposal.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="card p-8 relative overflow-hidden">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20 blur-3xl"
          style={{ background: accent }}
        />
        <div className="relative">
          <div className="chip mb-3">
            <Sparkles className="h-3 w-3" />
            AI proposal · {businessTypeName}
          </div>
          <h1 className="text-3xl font-semibold">Describe the brief.</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            The AI will pull from your item master and draft a curated proposal you can edit.
          </p>

          {catalogTableCount === 0 && (
            <div className="mt-4 card p-4 bg-amber-500/10 border-amber-500/40 text-amber-200 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Your item master is empty. Add at least one table with rows before generating —
                otherwise the AI has nothing to work with.
              </div>
            </div>
          )}

          {!hasAiKey && (
            <div className="mt-4 card p-4 bg-blue-500/10 border-blue-500/40 text-blue-200 text-sm flex gap-2">
              <Database className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <strong>Demo mode:</strong> no ANTHROPIC_API_KEY detected — we&apos;ll use a
                deterministic local generator that still pulls from your catalog. Add a key to
                .env to enable Claude.
              </div>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-5">
            {templates.length > 0 && (
              <Select
                label="Proposal template"
                value={proposalTemplateId}
                onChange={(e) => setProposalTemplateId(e.target.value)}
                hint="House style: tone, intro, default inclusions/terms, accent color, section recipe."
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>
                ))}
              </Select>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Proposal title"
                placeholder="e.g. Priya & Arjun · Wedding Dec '26"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {contacts.length > 0 && (
                <Select
                  label="Existing client (optional)"
                  value={contactId}
                  onChange={(e) => pickContact(e.target.value)}
                >
                  <option value="">— pick a client or enter manually —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>{c.fullName}</option>
                  ))}
                </Select>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Client name"
                placeholder="e.g. Priya & Arjun"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
              <Input
                label="Client email (optional)"
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>

            <Textarea
              label="The brief"
              placeholder="What does the client need? Guest count, dates, venue, budget, dietary preferences, must-haves…"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              className="min-h-[200px]"
              required
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-muted)]">Try a sample:</span>
              {TEMPLATES.default.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setBrief(t)}
                  className="chip hover:border-[var(--color-primary)]/60 hover:text-white transition"
                >
                  Template {i + 1}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                loading={loading}
                disabled={!brief.trim() || !clientName.trim() || catalogTableCount === 0}
              >
                <Wand2 className="h-4 w-4" /> Generate proposal <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
          >
            <div className="card p-8 text-center max-w-md">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] animate-pulse">
                <Wand2 className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-semibold">Drafting your proposal…</h3>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Reading your catalog, picking items, writing the document.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
