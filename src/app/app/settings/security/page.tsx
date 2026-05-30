import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { SecurityPanel } from './SecurityPanel';

export default async function SecurityPage() {
  const ctx = await requireContext();
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold">Security</h1>
        <p className="mt-1 text-[var(--color-muted)]">Protect your account.</p>
        <SecurityPanel enabled={!!user?.totpEnabled} />
      </div>
    </PageTransition>
  );
}
