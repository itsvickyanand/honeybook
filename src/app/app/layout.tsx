import { requireContext } from '@/lib/session';
import { hasPermission } from '@/lib/session';
import { Sidebar, NavEntry } from '@/components/dashboard/Sidebar';
import { TestModeBanner } from '@/components/dashboard/TestModeBanner';
import { Topbar } from '@/components/dashboard/Topbar';
import { CallProvider } from '@/components/calling';
import { mockedList } from '@/lib/feature-flags';

// Sidebar IA — mirrors the HoneyBook layout (Setup → Home → Projects →
// Lead capture → Calendar → Services → Files → Clients → Inbox → Finance →
// Reports → Settings), while preserving every existing route as a target.
const ALL_NAV: NavEntry[] = [
  { href: '/app/setup', label: 'Setup', icon: 'Rocket' },
  { href: '/app', label: 'Home', icon: 'Home' },
  { href: '/app/projects', label: 'Projects', icon: 'Kanban', permission: 'proposal.view' },
  { href: '/app/my-work', label: 'My Work', icon: 'Sparkle', permission: 'contact.view' },
  { href: '/app/workload', label: 'Workload', icon: 'Users', permission: 'team.view' },
  {
    label: 'Lead capture',
    icon: 'Inbox',
    permission: 'contact.view',
    children: [
      { href: '/app/forms', label: 'Lead forms' },
      { href: '/app/leads', label: 'Pipeline' },
    ],
  },
  { href: '/app/calendar', label: 'Calendar', icon: 'CalendarDays', permission: 'contact.view' },
  { href: '/app/catalog', label: 'Services', icon: 'LayoutGrid', permission: 'catalog.view' },
  {
    label: 'Files',
    icon: 'FolderOpen',
    permission: 'proposal.view',
    children: [
      { href: '/app/proposals', label: 'Proposals' },
      { href: '/app/invoices', label: 'Invoices' },
      { href: '/app/documents', label: 'Documents' },
      { href: '/app/galleries', label: 'Galleries' },
    ],
  },
  { href: '/app/contacts', label: 'Clients', icon: 'Users', permission: 'contact.view' },
  { href: '/app/inbox', label: 'Inbox', icon: 'MessageSquare', permission: 'contact.view' },
  {
    label: 'Finance',
    icon: 'Wallet',
    permission: 'proposal.view',
    children: [
      { href: '/app/finance', label: 'Overview' },
      { href: '/app/finance/payments', label: 'Payments' },
      { href: '/app/finance/invoices', label: 'Invoices' },
      { href: '/app/finance/accounting', label: 'Accounting' },
      { href: '/app/finance/gst', label: 'GST hub' },
    ],
  },
  { href: '/app/reviews', label: 'Reviews', icon: 'Sparkles', permission: 'contact.view' },
  { href: '/app/analytics', label: 'Reports', icon: 'BarChart3' },
  { href: '/app/settings', label: 'Settings', icon: 'Settings' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireContext();
  const nav = ALL_NAV.filter(
    (n) => !n.permission || hasPermission(ctx.permissions, n.permission)
  );
  const mocked = mockedList();

  return (
    <CallProvider tenantId={ctx.tenant.id}>
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
    </CallProvider>
  );
}
