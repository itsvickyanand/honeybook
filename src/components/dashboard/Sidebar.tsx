'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Database,
  FileText,
  Users,
  Settings,
  LogOut,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  Receipt,
  Kanban,
  BarChart3,
  MessageSquare,
  Inbox,
  CalendarDays,
  Briefcase,
  Images,
  FolderOpen,
} from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface NavEntry {
  href: string;
  label: string;
  icon: string;
  permission?: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Database,
  FileText,
  Users,
  Settings,
  Sparkles,
  Receipt,
  Kanban,
  BarChart3,
  MessageSquare,
  Inbox,
  CalendarDays,
  Briefcase,
  Images,
  FolderOpen,
};

export function Sidebar({
  tenant,
  user,
  role,
  nav,
}: {
  tenant: { name: string; businessType: { name: string; accentColor: string; icon: string } };
  user: { fullName: string; email: string };
  role: { name: string };
  nav: NavEntry[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 264 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="hidden md:flex flex-col border-r bg-[var(--color-surface)] h-screen sticky top-0 z-30"
    >
      <div className="flex items-center gap-3 p-4 border-b">
        <div
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ background: tenant.businessType.accentColor }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="brand"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex-1 min-w-0"
            >
              <div className="truncate font-semibold">{tenant.name}</div>
              <div className="truncate text-xs text-[var(--color-muted)]">
                {tenant.businessType.name}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          className="btn-ghost p-1.5"
          onClick={() => setCollapsed((c) => !c)}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active =
            item.href === '/app'
              ? pathname === '/app'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                active
                  ? 'bg-[var(--color-surface-2)] text-white'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-white'
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-accent)]"
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    className="truncate"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-xs font-semibold">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium">{user.fullName}</div>
              <div className="truncate text-xs text-[var(--color-muted)]">{role.name}</div>
            </div>
          )}
          <button onClick={logout} className="btn-ghost p-1.5" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
