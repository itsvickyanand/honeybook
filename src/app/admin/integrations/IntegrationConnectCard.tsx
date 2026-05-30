'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { ChevronDown, ExternalLink } from 'lucide-react';

interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'password' | 'url';
  required?: boolean;
  helpText?: string;
}

interface Spec {
  provider: string;
  displayName: string;
  description: string;
  kind: 'oauth' | 'apiKey' | 'webhook' | 'builtin';
  docsUrl?: string;
  fields?: FieldSpec[];
  oauthCallback?: string;
  optional: boolean;
}

export default function IntegrationConnectCard({
  spec,
  status,
  displayLabel,
}: {
  spec: Spec;
  status: string;
  displayLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const router = useRouter();
  const connected = status === 'CONNECTED';

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integrations/${spec.provider}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credentials: values }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Save failed');
      toast.success(`${spec.displayName} connected`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm(`Disconnect ${spec.displayName}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/integrations/${spec.provider}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success(`${spec.displayName} disconnected`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{spec.displayName}</h3>
            {!spec.optional && (
              <span className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">required</span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{spec.description}</p>
          {displayLabel && connected && (
            <p className="mt-1 text-xs text-slate-500">{displayLabel}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs">
            {spec.docsUrl && (
              <a
                href={spec.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-slate-500 hover:text-rose-600"
              >
                <ExternalLink size={12} /> Docs
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {spec.kind === 'oauth' ? (
            <a
              href={`/api/oauth/${spec.provider}/start`}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
            >
              {connected ? 'Reconnect' : 'Connect'}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              {connected ? 'Edit' : 'Connect'}
              <ChevronDown size={12} className={`ml-1 inline transition ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
          {connected && (
            <button
              type="button"
              onClick={disconnect}
              disabled={busy}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {open && spec.kind === 'apiKey' && (
        <div className="space-y-3 border-t border-slate-100 bg-slate-50 p-4">
          {(spec.fields ?? []).map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-700">
                {f.label}{f.required ? ' *' : ''}
              </label>
              <input
                type={f.type}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-rose-500"
              />
              {f.helpText && <p className="mt-0.5 text-xs text-slate-500">{f.helpText}</p>}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
