import { requireContext } from '@/lib/session';
import { prisma } from '@/lib/db';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { InboxClient } from './InboxClient';

export default async function InboxPage() {
  const ctx = await requireContext();
  const threads = await prisma.chatThread.findMany({
    where: { tenantId: ctx.tenant.id },
    include: {
      contact: true,
      proposal: { select: { id: true, title: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    take: 100,
  });
  return (
    <PageTransition>
      <InboxClient
        currentUserId={ctx.user.id}
        threads={threads.map((t) => ({
          id: t.id,
          channel: t.channel,
          contactName: t.contact?.fullName ?? null,
          proposalTitle: t.proposal?.title ?? null,
          lastMessage: t.messages[0]?.body ?? null,
          lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
        }))}
      />
    </PageTransition>
  );
}
