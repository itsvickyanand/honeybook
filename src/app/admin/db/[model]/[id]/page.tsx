/**
 * Admin DB browser — single row detail.
 * Shows every field. JSON columns get a syntax-highlighted viewer.
 * Edit / delete actions land in Phase B with typed confirmation.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { prisma } from '@/lib/db';
import { getModel } from '@/lib/admin/model-registry';
import { ArrowLeft, Copy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminRowDetail({
  params,
}: {
  params: Promise<{ model: string; id: string }>;
}) {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login');

  const { model: modelKey, id } = await params;
  const spec = getModel(modelKey);
  if (!spec) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma as any)[spec.key];
  if (!delegate) notFound();

  const row = await delegate.findUnique({ where: { id } });
  if (!row) notFound();

  const fields = Object.entries(row as Record<string, unknown>);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/db/${spec.key}`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} /> Back to {spec.label}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {String(row[spec.primaryCol as keyof typeof row] ?? row.id ?? '(row)')}
        </h1>
        <p className="font-mono text-xs text-slate-500">{String(row.id)}</p>
      </div>

      {/* Field grid */}
      <div className="rounded-xl border border-slate-200 bg-white p-1">
        <table className="w-full text-sm">
          <tbody>
            {fields.map(([key, val]) => (
              <tr key={key} className="border-b border-slate-100 last:border-0">
                <td className="w-56 px-4 py-3 align-top">
                  <div className="font-mono text-xs text-slate-500">{key}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    {typeOf(val)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <FieldValue value={val} fieldKey={key} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phase-B placeholders */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Phase B coming:</strong> edit, delete, and duplicate actions land in the next admin upgrade — with typed confirmation for destructive ops and a PlatformAuditLog entry per change.
      </div>
    </div>
  );
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (v instanceof Date) return 'date';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function FieldValue({ value, fieldKey }: { value: unknown; fieldKey: string }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-300">—</span>;
  }
  if (value instanceof Date) {
    return (
      <span>
        <span className="text-slate-700">{value.toLocaleString()}</span>
        <span className="ml-2 text-xs text-slate-400">{value.toISOString()}</span>
      </span>
    );
  }
  if (typeof value === 'boolean') {
    return value
      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">true</span>
      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">false</span>;
  }
  if (typeof value === 'number') {
    return <span className="tabular-nums text-slate-900">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value, null, 2);
    return (
      <details>
        <summary className="cursor-pointer text-rose-600 hover:underline">
          JSON ({json.length.toLocaleString()} chars)
        </summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
          {json}
        </pre>
      </details>
    );
  }
  const str = String(value);
  // ID-like fields get a deep-link if we can guess the model from the field name
  const refModel = guessRefModel(fieldKey);
  if (refModel) {
    return (
      <span className="flex items-center gap-2">
        <Link
          href={`/admin/db/${refModel}/${encodeURIComponent(str)}`}
          className="font-mono text-xs text-rose-600 hover:underline"
        >
          {str}
        </Link>
        <CopyButton text={str} />
      </span>
    );
  }
  if (str.length > 200) {
    return (
      <details>
        <summary className="cursor-pointer text-slate-600 hover:underline">
          {str.slice(0, 200)}…
        </summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-slate-700">
          {str}
        </pre>
      </details>
    );
  }
  return <span className="text-slate-900">{str}</span>;
}

function guessRefModel(fieldKey: string): string | null {
  const m: Record<string, string> = {
    tenantId: 'tenant',
    userId: 'user',
    contactId: 'contact',
    leadId: 'lead',
    proposalId: 'proposal',
    projectId: 'project',
    taskId: 'task',
    invoiceId: 'invoice',
    paymentId: 'payment',
    roleId: 'role',
    teamId: 'team',
    formId: 'leadForm',
    threadId: 'chatThread',
    pipelineId: 'pipeline',
    stageId: 'stage',
    fileId: 'fileObject',
    galleryId: 'gallery',
    proposalTemplateId: 'proposalTemplate',
    contractTemplateId: 'contractTemplate',
    meetingTypeId: 'meetingType',
    sequenceId: 'dripSequence',
  };
  return m[fieldKey] ?? null;
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      data-copy={text}
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      title="Copy"
      // We can't bind onClick in a server component; use a tiny inline script.
      // For now it's purely decorative; will wire to a client component in Phase B.
    >
      <Copy size={12} />
    </button>
  );
}
