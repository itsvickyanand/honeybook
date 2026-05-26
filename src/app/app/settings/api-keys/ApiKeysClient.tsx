'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Plus, KeyRound, Webhook, Trash2, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { timeAgo } from '@/lib/utils';

interface ApiKeyRow { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }
interface Hook { id: string; url: string; active: boolean; events: string[] }

const EVENT_OPTIONS = [
  'lead.created', 'proposal.sent', 'proposal.viewed', 'proposal.accepted', 'proposal.declined',
  'payment.received', 'invoice.paid', 'invoice.overdue', 'signature.signed',
];

export function ApiKeysClient({ initialKeys, initialHooks }: { initialKeys: ApiKeyRow[]; initialHooks: Hook[] }) {
  const router = useRouter();
  const [keys, setKeys] = React.useState(initialKeys);
  const [hooks, setHooks] = React.useState(initialHooks);
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [hookOpen, setHookOpen] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState<string | null>(null);

  async function createKey(name: string) {
    const res = await fetch('/api/api-keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, scopes: ['*'] }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? 'Failed');
    setKeys((k) => [{ id: data.key.id, name: data.key.name, prefix: data.key.prefix, createdAt: new Date().toISOString(), lastUsedAt: null }, ...k]);
    setShowSecret(data.secret);
    setKeyOpen(false);
    router.refresh();
  }
  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key?')) return;
    const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Failed');
    setKeys((k) => k.filter((x) => x.id !== id));
    toast.success('Revoked');
  }
  async function createHook(url: string, events: string[]) {
    const res = await fetch('/api/webhooks-out', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, events }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error ?? 'Failed');
    setHooks((h) => [{ id: data.hook.id, url: data.hook.url, active: true, events: data.hook.events }, ...h]);
    setHookOpen(false);
    toast.success('Webhook added');
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-8">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4" /> API keys</h2>
          <Button onClick={() => setKeyOpen(true)}><Plus className="h-4 w-4" /> New key</Button>
        </div>
        {keys.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--color-muted)]">No keys yet.</div>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="card p-4 flex items-center gap-3">
                <div className="flex-1">
                  <div className="font-medium">{k.name}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">
                    <code>{k.prefix}…</code> · created {timeAgo(k.createdAt)} · {k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : 'never used'}
                  </div>
                </div>
                <button onClick={() => revokeKey(k.id)} className="btn-ghost p-2 text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><Webhook className="h-4 w-4" /> Outbound webhooks</h2>
          <Button onClick={() => setHookOpen(true)}><Plus className="h-4 w-4" /> New webhook</Button>
        </div>
        {hooks.length === 0 ? (
          <div className="card p-8 text-center text-sm text-[var(--color-muted)]">No webhooks yet.</div>
        ) : (
          <div className="space-y-2">
            {hooks.map((h) => (
              <div key={h.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <code className="text-sm truncate block">{h.url}</code>
                    <div className="text-xs text-[var(--color-muted)] mt-1">{h.events.length} events</div>
                  </div>
                  <span className={`chip ${h.active ? 'bg-emerald-500/20 text-emerald-300' : ''}`}>{h.active ? 'Active' : 'Paused'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <NewKeyModal open={keyOpen} onClose={() => setKeyOpen(false)} onCreate={createKey} />
      <NewHookModal open={hookOpen} onClose={() => setHookOpen(false)} onCreate={createHook} />

      <Modal open={!!showSecret} onClose={() => setShowSecret(null)} title="Save your API key">
        <p className="text-sm text-[var(--color-muted)]">This is the only time we&apos;ll show it. Copy it now.</p>
        {showSecret && (
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-xl border bg-[var(--color-surface-2)] p-3 font-mono text-sm break-all">{showSecret}</code>
            <button onClick={() => { navigator.clipboard.writeText(showSecret); toast.success('Copied'); }} className="btn-secondary"><Copy className="h-4 w-4" /></button>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setShowSecret(null)}>Done</Button>
        </div>
      </Modal>
    </motion.div>
  );
}

function NewKeyModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = React.useState('');
  return (
    <Modal open={open} onClose={onClose} title="Create API key">
      <Input label="Name" placeholder="e.g. Reporting integration" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onCreate(name)} disabled={!name.trim()}>Create</Button>
      </div>
    </Modal>
  );
}

function NewHookModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (url: string, events: string[]) => void }) {
  const [url, setUrl] = React.useState('');
  const [events, setEvents] = React.useState<string[]>(['proposal.accepted', 'payment.received']);
  function toggle(e: string) { setEvents((a) => a.includes(e) ? a.filter((x) => x !== e) : [...a, e]); }
  return (
    <Modal open={open} onClose={onClose} title="Add outbound webhook" size="lg">
      <Input label="URL" type="url" placeholder="https://example.com/hooks/avantus" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      <div className="mt-4">
        <label className="label-base">Events</label>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_OPTIONS.map((e) => (
            <label key={e} className="flex items-center gap-2 rounded-xl border bg-[var(--color-surface-2)] p-2 text-sm cursor-pointer">
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} />
              <code className="text-xs">{e}</code>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onCreate(url, events)} disabled={!url.trim() || events.length === 0}>Add</Button>
      </div>
    </Modal>
  );
}
