import Link from 'next/link';
import { Database, Plus, Rows3, Columns3 } from 'lucide-react';
import { requireContext, hasPermission } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { CreateTableButton } from './CreateTableButton';

export default async function CatalogPage() {
  const ctx = await requireContext();
  const canEditSchema = hasPermission(ctx.permissions, 'schema.edit');

  const tables = await prisma.customTable.findMany({
    where: { tenantId: ctx.tenant.id },
    include: { _count: { select: { rows: true, columns: true } } },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">Item Master</h1>
            <p className="mt-1 text-[var(--color-muted)]">
              Your catalog tables. The AI proposal engine reads from these.
            </p>
          </div>
          {canEditSchema && <CreateTableButton />}
        </div>

        {tables.length === 0 ? (
          <div className="card p-12 text-center">
            <Database className="mx-auto h-10 w-10 text-[var(--color-muted)]" />
            <h3 className="mt-3 font-semibold">No tables yet</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Create your first item-master table to get started.
            </p>
            {canEditSchema && (
              <div className="mt-4">
                <CreateTableButton />
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <Link
                key={t.id}
                href={`/app/catalog/${t.id}`}
                className="card p-6 transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/60 hover:shadow-2xl hover:shadow-[var(--color-primary)]/10"
              >
                <div className="flex items-start justify-between">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-accent)]/20">
                    <Database className="h-5 w-5 text-[var(--color-primary-soft)]" />
                  </div>
                  {t.isSystem && <span className="chip">Default</span>}
                </div>
                <h3 className="mt-4 font-semibold">{t.name}</h3>
                {t.description && (
                  <p className="mt-1 text-sm text-[var(--color-muted)] line-clamp-2">
                    {t.description}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-1">
                    <Rows3 className="h-3 w-3" />
                    {t._count.rows} rows
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Columns3 className="h-3 w-3" />
                    {t._count.columns} cols
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
