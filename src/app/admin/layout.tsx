/**
 * Platform admin layout — separate visual shell from the tenant app.
 * Red top stripe is a visual hint so a logged-in admin never confuses scope.
 *
 * Note: doesn't render <html>/<body> because the root layout at src/app/layout.tsx
 * already owns those. Auth gate enforced via per-page requirePlatformSession().
 */
import Link from 'next/link';
import {
  LayoutDashboard,
  Settings,
  Users2,
  LogOut,
  Building2,
  Database,
  ScrollText,
} from 'lucide-react';
import { getPlatformSession } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-1 bg-gradient-to-r from-rose-600 to-orange-500" />
      <div className="grid min-h-[calc(100vh-4px)] grid-cols-1 md:grid-cols-[240px_1fr]">
        {session && (
          <aside className="border-r border-slate-200 bg-white p-5">
            <div className="mb-6">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600">
                Platform Admin
              </div>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-700">
                {session.email}
              </div>
              <div className="text-[11px] text-slate-500">{session.role}</div>
            </div>

            <NavGroup label="Overview">
              <NavItem href="/admin" label="Dashboard" icon={LayoutDashboard} />
            </NavGroup>

            <NavGroup label="Customers">
              <NavItem href="/admin/tenants" label="Tenants" icon={Building2} />
              <NavItem href="/admin/users" label="Users" icon={Users2} />
            </NavGroup>

            <NavGroup label="Operations">
              <NavItem href="/admin/db" label="Database" icon={Database} />
              <NavItem href="/admin/audit" label="Audit log" icon={ScrollText} />
              <NavItem href="/admin/integrations" label="Integrations" icon={Settings} />
            </NavGroup>

            <form action="/api/admin/auth/logout" method="POST" className="mt-8 border-t border-slate-200 pt-4">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </form>
          </aside>
        )}
        <main className={session ? 'p-8' : 'p-0'}>{children}</main>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <nav className="space-y-0.5">{children}</nav>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-100"
    >
      <Icon size={14} />
      {label}
    </Link>
  );
}
