/**
 * Vendor-side: send the current proposal to the client for signature.
 *  POST → create a SignatureRequest (or reuse a PENDING one), email the
 *         signing link to the client, return the URL.
 */
import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { createSignRequest } from '@/lib/esign/digio';
import { renderProposalHtml } from '@/lib/pdf/proposal-template';
import { sendEmail } from '@/lib/comms';
import { audit } from '@/lib/audit';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;

  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { tenant: true },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!proposal.clientName) {
    return NextResponse.json({ error: 'Set a client name first' }, { status: 400 });
  }
  if (!proposal.clientEmail) {
    return NextResponse.json({ error: 'Add a client email before sending for signature' }, { status: 400 });
  }

  // Reuse an existing PENDING/SENT request rather than spawning duplicates.
  const existing = await prisma.signatureRequest.findFirst({
    where: { proposalId: proposal.id, status: { in: ['PENDING', 'SENT'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing && existing.externalId) {
    const back = `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${proposal.shareToken}`;
    const signUrl = process.env.DIGIO_CLIENT_ID
      ? '' // real Digio URL was on the original create; we'd need a Digio-resend call — TODO when key present
      : `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-sign?ref=${existing.id}&back=${encodeURIComponent(back)}`;
    await sendEmail({
      to: proposal.clientEmail,
      subject: `Reminder: please sign your agreement with ${proposal.tenant.name}`,
      html: `<p>Hi ${proposal.clientName},</p><p>This is a gentle reminder to sign your agreement.</p><p><a href="${signUrl}">Sign now</a></p>`,
    });
    return NextResponse.json({ requestId: existing.id, signUrl, resent: true });
  }

  // Render the proposal HTML as the doc to sign
  const html = renderProposalHtml(proposal);
  const base64 = Buffer.from(html, 'utf8').toString('base64');
  const result = await createSignRequest({
    signerName: proposal.clientName,
    signerEmail: proposal.clientEmail,
    documentBase64: base64,
    filename: `${proposal.title}.html`,
  });

  const sig = await prisma.signatureRequest.create({
    data: {
      tenantId: proposal.tenantId,
      proposalId: proposal.id,
      provider: 'digio',
      externalId: result.externalId,
      signerName: proposal.clientName,
      signerEmail: proposal.clientEmail,
      status: result.mock ? 'PENDING' : 'SENT',
    },
  });

  const back = `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${proposal.shareToken}`;
  const signUrl = result.mock
    ? `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-sign?ref=${sig.id}&back=${encodeURIComponent(back)}`
    : result.signingUrl;

  // Email the signing link to the client.
  await sendEmail({
    to: proposal.clientEmail,
    subject: `Please sign your agreement with ${proposal.tenant.name}`,
    html: `<p>Hi ${proposal.clientName},</p>
<p>Your agreement is ready. Sign it electronically — should take a minute.</p>
<p style="margin:24px 0">
  <a href="${signUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Sign agreement</a>
</p>
<p style="color:#666;font-size:12px">If the button doesn&apos;t work, paste this link in your browser:<br/>${signUrl}</p>`,
  });

  await audit({
    tenantId: proposal.tenantId,
    userId: auth.user.id,
    action: 'send',
    entity: 'SignatureRequest',
    entityId: sig.id,
  });

  return NextResponse.json({ requestId: sig.id, signUrl, resent: false });
}
