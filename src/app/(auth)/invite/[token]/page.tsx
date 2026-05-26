import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { InviteAcceptForm } from './InviteAcceptForm';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await prisma.userInvite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date()) notFound();
  const [tenant, role] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: invite.tenantId } }),
    prisma.role.findUnique({ where: { id: invite.roleId } }),
  ]);
  if (!tenant || !role) notFound();
  if (invite.acceptedAt) {
    return (
      <div className="card p-8 max-w-md text-center">
        <h1 className="text-xl font-semibold">Invitation already accepted</h1>
      </div>
    );
  }
  return (
    <InviteAcceptForm
      token={token}
      email={invite.email}
      tenantName={tenant.name}
      roleName={role.name}
      suggestedFullName={invite.fullName ?? ''}
    />
  );
}
