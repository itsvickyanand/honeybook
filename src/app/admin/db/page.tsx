/**
 * Admin DB browser — index.
 * Lists every browsable Prisma model grouped by domain.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-auth';
import { MODEL_REGISTRY, MODEL_GROUPS } from '@/lib/admin/model-registry';
import { Database, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminDbIndex() {
  const session = await getPlatformSession();
  if (!session) redirect('/admin/login?next=/admin/db');

  const byGroup: Record<string, typeof MODEL_REGISTRY> = {};
  for (const m of MODEL_REGISTRY) {
    if (!byGroup[m.group]) byGroup[m.group] = [];
    byGroup[m.group].push(m);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
          <Database size={20} /> Database
        </h1>
        <p className="text-sm text-slate-600">
          Browse every table across all tenants. Read-only for now — edits land in Phase B with typed-confirmation safety.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {(Object.keys(MODEL_GROUPS) as Array<keyof typeof MODEL_GROUPS>).map((groupKey) => {
          const models = byGroup[groupKey] ?? [];
          if (!models.length) return null;
          return (
            <section key={groupKey}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {MODEL_GROUPS[groupKey]}
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {models.map((m) => (
                  <li key={m.key}>
                    <Link
                      href={`/admin/db/${m.key}`}
                      className="flex items-center justify-between px-3 py-2.5 text-sm hover:bg-slate-50"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{m.label}</div>
                        <div className="text-xs text-slate-500">{m.key}</div>
                      </div>
                      <ChevronRight size={14} className="text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
