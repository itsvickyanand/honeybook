import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { parsePermissions } from '@/lib/session';
import { Shield, User as UserIcon } from 'lucide-react';

export default async function SettingsPage() {
  const ctx = await requireContext();
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { createdAt: 'asc' } }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenant.id },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-1 text-[var(--color-muted)]">
            Workspace, roles, and team. (Read-only in this demo build — wiring the mutations is a follow-up.)
          </p>
        </div>

        {/* Tenant info */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Workspace</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Business name" value={ctx.tenant.name} />
            <Field label="Business type" value={ctx.tenant.businessType.name} />
            <Field label="Currency" value={ctx.tenant.currency} />
            <Field label="Tax" value={`${ctx.tenant.taxLabel} · ${ctx.tenant.taxRate}%`} />
            <Field label="Workspace URL slug" value={ctx.tenant.slug} mono />
            <Field
              label="Created"
              value={new Date(ctx.tenant.createdAt).toLocaleDateString()}
            />
          </div>
        </div>

        {/* Roles */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Roles
          </h2>
          <div className="space-y-2">
            {roles.map((r) => {
              const perms = parsePermissions(r.permissions);
              return (
                <div key={r.id} className="rounded-xl border bg-[var(--color-surface-2)] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{r.name}</div>
                      {r.description && (
                        <div className="text-xs text-[var(--color-muted)] mt-0.5">{r.description}</div>
                      )}
                    </div>
                    {r.isSystem && <span className="chip">System</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {perms.map((p) => (
                      <span key={p} className="chip text-xs">{p}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Users */}
        <div className="card p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <UserIcon className="h-4 w-4" /> Team
          </h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-xl border bg-[var(--color-surface-2)] p-3"
              >
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-sm font-semibold">
                  {u.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{u.fullName}</div>
                  <div className="text-xs text-[var(--color-muted)] truncate">{u.email}</div>
                </div>
                <span className="chip">{u.role.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</div>
      <div className={`mt-1 ${mono ? 'font-mono text-sm' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
