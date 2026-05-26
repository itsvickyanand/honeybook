import { requireContext } from '@/lib/session';
import { hasPermission } from '@/lib/session';
import { Sidebar, NavEntry } from '@/components/dashboard/Sidebar';
import { TestModeBanner } from '@/components/dashboard/TestModeBanner';
import { Topbar } from '@/components/dashboard/Topbar';
import { mockedList } from '@/lib/feature-flags';

const ALL_NAV: NavEntry[] = [
  { href: '/app', label: 'Overview', icon: 'Home' },
  { href: '/app/leads', label: 'Pipeline', icon: 'Kanban', permission: 'contact.view' },
  { href: '/app/inbox', label: 'Inbox', icon: 'MessageSquare', permission: 'contact.view' },
  { href: '/app/catalog', label: 'Item Master', icon: 'Database', permission: 'catalog.view' },
  { href: '/app/contacts', label: 'Clients', icon: 'Users', permission: 'contact.view' },
  { href: '/app/proposals', label: 'Proposals', icon: 'FileText', permission: 'proposal.view' },
  { href: '/app/invoices', label: 'Invoices', icon: 'Receipt', permission: 'proposal.view' },
  { href: '/app/forms', label: 'Lead Forms', icon: 'Inbox', permission: 'contact.view' },
  { href: '/app/analytics', label: 'Analytics', icon: 'BarChart3' },
  { href: '/app/settings', label: 'Settings', icon: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const nav = ALL_NAV.filter(
    (n) => !n.permission || hasPermission(ctx.permissions, n.permission)
  );
  const mocked = mockedList();

  return (
    <div className="flex min-h-screen">
      <Sidebar
        tenant={{ name: ctx.tenant.name, businessType: ctx.tenant.businessType }}
        user={{ fullName: ctx.user.fullName, email: ctx.user.email }}
        role={{ name: ctx.role.name }}
        nav={nav}
      />
      <main className="flex-1 min-w-0">
        <TestModeBanner mocked={mocked} />
        <Topbar />
        {children}
      </main>
    </div>
  );
}
