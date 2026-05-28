import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { FinanceTabs } from './FinanceTabs';

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-[var(--color-primary)]" />
          Finance
        </h1>
        <Link href="/app/finance/invoices" className="btn-secondary text-sm py-2 px-3">
          New invoice
        </Link>
      </div>
      <p className="text-sm text-[var(--color-muted)] mb-6">
        Money in, money out, and what the tax authorities need to know.
      </p>

      <FinanceTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
