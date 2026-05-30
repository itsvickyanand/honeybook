/**
 * Platform admin layout — separate visual shell from the tenant app.
 * Red top stripe is a visual hint so a logged-in admin never confuses scope.
 *
 * Note: doesn't render <html>/<body> because the root layout at src/app/layout.tsx
 * already owns those. Auth gate enforced via per-page requirePlatformSession().
 */
import Link from 'next/link';
import { LayoutDashboard, Settings, Users2, LogOut } from 'lucide-react';
import { getPlatformSession } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSession();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-1 bg-gradient-to-r from-rose-600 to-orange-500" />
      <div className="grid min-h-[calc(100vh-4px)] grid-cols-1 md:grid-cols-[260px_1fr]">
        {session && (
          <aside className="border-r border-slate-200 bg-white p-5">
            <div className="mb-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-rose-600">Platform Admin</div>
              <div className="text-sm font-semibold text-slate-700">{session.email}</div>
            </div>
            <nav className="space-y-1">
              <NavItem href="/admin" label="Overview" icon={LayoutDashboard} />
              <NavItem href="/admin/tenants" label="Tenants" icon={Users2} />
              <NavItem href="/admin/integrations" label="Integrations" icon={Settings} />
            </nav>
            <form action="/api/admin/auth/logout" method="POST" className="mt-8">
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
