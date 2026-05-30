import { requireContext } from '@/lib/session';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { WhatsAppTemplates } from './WhatsAppTemplates';

export default async function WhatsAppSettingsPage() {
  await requireContext();
  return (
    <PageTransition>
      <div className="p-6 md:p-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-semibold">WhatsApp templates</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Templates approved by Meta. New templates must be created in Meta Business Manager and approved before use.
        </p>
        <WhatsAppTemplates />
      </div>
    </PageTransition>
  );
}
