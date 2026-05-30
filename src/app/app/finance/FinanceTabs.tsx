'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/app/finance', label: 'Overview' },
  { href: '/app/finance/payments', label: 'Payments' },
  { href: '/app/finance/invoices', label: 'Invoices' },
  { href: '/app/finance/accounting', label: 'Accounting' },
  { href: '/app/finance/gst', label: 'GST hub' },
];

export function FinanceTabs() {
  const pathname = usePathname();
  return (
    <div className="border-b" style={{ borderColor: 'var(--color-border)' }}>
      <nav className="flex gap-1 -mb-px overflow-x-auto">
        {TABS.map((t) => {
          const active =
            t.href === '/app/finance' ? pathname === '/app/finance' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                active
                  ? 'border-[var(--color-primary)] text-white'
                  : 'border-transparent text-[var(--color-muted)] hover:text-white'
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
