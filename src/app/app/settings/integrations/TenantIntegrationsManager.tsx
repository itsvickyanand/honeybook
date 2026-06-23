'use client';
/**
 * Per-tenant integrations Settings manager.
 *
 * For each business-level integration in the registry, shows a card with:
 *   - Current state (Connected / Demo mode / Not configured)
 *   - Connect button that opens an inline credentials form (for apiKey kind)
 *   - OAuth handoff link (for oauth kind)
 *   - Disconnect for connected rows
 *
 * After save we hit /api/integrations/[provider] which encrypts + stores via
 * the existing platform-level connect API.
 */
import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plug, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, ExternalLink, Trash2,
} from 'lucide-react';
import Link from 'next/link';

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url' | 'textarea';
  required?: boolean;
  helpText?: string;
}
interface CardData {
  provider: string;
  displayName: string;
  description: string;
  category: string;
  kind: string;
  docsUrl?: string;
  fields: FieldSpec[];
  oauthCallback?: string;
  status: string;
  displayLabel: string | null;
  updatedAt: string | null;
  demoFallbackActive: boolean;
}

export function TenantIntegrationsManager({ cards }: { cards: CardData[] }) {
  // Surface ?connected=… / ?error=… from the OAuth callback as toasts so the
  // user knows their OAuth roundtrip succeeded or what went wrong.
  const sp = useSearchParams();
  const router = useRouter();
  React.useEffect(() => {
    const connected = sp.get('connected');
    const error = sp.get('error');
    if (connected) {
      toast.success(`${connected.replace('_', ' ')} connected`);
      router.replace('/app/settings/integrations');
    } else if (error) {
      toast.error(decodeURIComponent(error));
      router.replace('/app/settings/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group by category for cleaner scanning.
  const byCategory = React.useMemo(() => {
    const map = new Map<string, CardData[]>();
    for (const c of cards) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [cards]);

  const ordered = ['payments', 'esign', 'comms', 'compliance', 'accounting', 'calendar', 'scheduling', 'ai', 'storage', 'observability'];
  const categories = ordered.filter((c) => byCategory.has(c)).concat(
    Array.from(byCategory.keys()).filter((c) => !ordered.includes(c)),
  );

  return (
    <div className="space-y-8">
      {categories.map((cat) => (
        <section key={cat}>
          <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {labelForCategory(cat)}
          </h2>
          <div className="space-y-3">
            {byCategory.get(cat)!.map((c) => <Card key={c.provider} card={c} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function labelForCategory(c: string): string {
  switch (c) {
    case 'payments': return 'Payments';
    case 'esign': return 'E-signature';
    case 'comms': return 'Communications';
    case 'compliance': return 'Compliance & GST';
    case 'accounting': return 'Accounting';
    case 'calendar': return 'Calendar';
    case 'scheduling': return 'Scheduling';
    case 'ai': return 'AI';
    case 'storage': return 'Storage';
    case 'observability': return 'Observability';
    default: return c.charAt(0).toUpperCase() + c.slice(1);
  }
}

function Card({ card }: { card: CardData }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const connected = card.status === 'CONNECTED';
  const isOAuth = card.kind === 'oauth';

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/${card.provider}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentials: values }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Connect failed');
      }
      toast.success(`${card.displayName} connected`);
      setOpen(false);
      setValues({});
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${card.displayName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/integrations/${card.provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Disconnect failed');
      toast.success(`${card.displayName} disconnected`);
      router.refresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-2)]">
          {connected ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
           card.demoFallbackActive ? <AlertCircle className="h-4 w-4 text-amber-400" /> :
           <Plug className="h-4 w-4 text-[var(--color-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{card.displayName}</div>
            {connected && card.displayLabel && (
              <span className="chip text-[10px]">{card.displayLabel}</span>
            )}
            {!connected && card.demoFallbackActive && (
              <span className="chip text-[10px] border-amber-500/40 bg-amber-500/10 text-amber-300">
                Demo mode
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{card.description}</p>
          {!connected && card.demoFallbackActive && (
            <p className="mt-2 text-[11px] text-amber-300/80">
              Running on platform credentials. Connect your own account to keep transactions, emails, and signatures branded as your business — and to lift demo-mode limits.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {card.docsUrl && (
            <Link href={card.docsUrl} target="_blank" className="btn-ghost text-xs" title="Provider docs">
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {connected ? (
            <button onClick={disconnect} disabled={busy} className="btn-ghost text-xs text-red-400">
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Disconnect
            </button>
          ) : isOAuth ? (
            <Link
              href={`/api/oauth/${card.provider}/start`}
              className="btn-primary text-xs"
            >
              <Plug className="h-3 w-3" /> Connect
            </Link>
          ) : (
            <button onClick={() => setOpen((o) => !o)} className="btn-primary text-xs">
              <Plug className="h-3 w-3" /> Connect
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-4">
          <div className="space-y-3">
            {card.fields.map((f) => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {f.label}{f.required ? ' *' : ''}
                </label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    rows={6}
                    className="input-base mt-1 w-full text-xs font-mono"
                  />
                ) : (
                  <input
                    type={f.type}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    className="input-base mt-1 w-full text-sm"
                  />
                )}
                {f.helpText && <p className="mt-1 text-[11px] text-[var(--color-muted)]">{f.helpText}</p>}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} disabled={busy} className="btn-ghost text-xs">Cancel</button>
              <button onClick={save} disabled={busy} className="btn-primary text-xs">
                {busy && <Loader2 className="h-3 w-3 animate-spin" />} Save & connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
