import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireContext, hasPermission } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { TableEditor } from './TableEditor';

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const table = await prisma.customTable.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      columns: { orderBy: { sortOrder: 'asc' } },
      rows: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!table) notFound();

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <Link
          href="/app/catalog"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-white mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Item Master
        </Link>

        <TableEditor
          tableId={table.id}
          tableName={table.name}
          tableDescription={table.description}
          isSystem={table.isSystem}
          currency={ctx.tenant.currency}
          locale={ctx.tenant.locale}
          canEditSchema={hasPermission(ctx.permissions, 'schema.edit')}
          canEditRows={hasPermission(ctx.permissions, 'catalog.edit')}
          initialColumns={table.columns.map((c) => ({
            id: c.id,
            slug: c.slug,
            name: c.name,
            type: c.type,
            required: c.required,
            options: (c.optionsJson as string[] | null) ?? null,
            helpText: c.helpText,
          }))}
          initialRows={table.rows.map((r) => ({
            id: r.id,
            data: r.data as Record<string, unknown>,
          }))}
        />
      </div>
    </PageTransition>
  );
}
