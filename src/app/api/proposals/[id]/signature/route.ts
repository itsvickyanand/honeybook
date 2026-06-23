/**
 * Vendor-side: send the proposal's CONTRACT to the client for signature.
 * Renders the customizable contract → PDF → chosen provider (Aadhaar/DocuSign),
 * emails the signing link.
 *
 * Body: { provider?: 'digio' | 'docusign' }
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { createSignature, type SignProvider } from '@/lib/esign';
import { resolveContractForProposal, renderContract, contractDocument } from '@/lib/contracts';
import { htmlToPdf } from '@/lib/pdf/render';
import { sendEmail } from '@/lib/comms';
import { formatCurrency } from '@/lib/utils';
import { audit } from '@/lib/audit';

const schema = z.object({ provider: z.enum(['digio', 'docusign']).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const provider: SignProvider = parsed.success && parsed.data.provider ? parsed.data.provider : 'digio';

  const proposal = await prisma.proposal.findFirst({
    where: { id, tenantId: auth.tenant.id },
    include: { tenant: true, project: { select: { name: true, startDate: true } } },
  });
  if (!proposal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!proposal.clientName) return NextResponse.json({ error: 'Set a client name first' }, { status: 400 });
  if (!proposal.clientEmail) return NextResponse.json({ error: 'Add a client email before sending for signature' }, { status: 400 });

  const template = await resolveContractForProposal(proposal.tenantId, proposal.contractTemplateId);
  const innerHtml = renderContract(template.bodyHtml, {
    clientName: proposal.clientName,
    vendorName: proposal.tenant.name,
    businessName: proposal.tenant.name,
    projectName: proposal.project?.name ?? proposal.title,
    total: formatCurrency(proposal.total, proposal.tenant.currency, proposal.tenant.locale),
    eventDate: proposal.project?.startDate ? proposal.project.startDate.toLocaleDateString('en-IN') : '',
  });
  const docHtml = contractDocument(innerHtml, `${proposal.title} — Agreement`);
  let pdfBase64: string;
  try { pdfBase64 = Buffer.from(await htmlToPdf(docHtml)).toString('base64'); }
  catch { pdfBase64 = Buffer.from(docHtml, 'utf8').toString('base64'); }

  const result = await createSignature({
    provider,
    signerName: proposal.clientName,
    signerEmail: proposal.clientEmail,
    pdfBase64,
    filename: `${proposal.title}-agreement.pdf`,
    returnUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${proposal.shareToken}?signed=1`,
  }, proposal.tenantId);

  const sig = await prisma.signatureRequest.create({
    data: {
      tenantId: proposal.tenantId,
      proposalId: proposal.id,
      provider: result.provider,
      externalId: result.externalId,
      signerName: proposal.clientName,
      signerEmail: proposal.clientEmail,
      status: result.mock ? 'PENDING' : 'SENT',
      payload: { contractHtml: docHtml, contractTemplateId: template.id } as object,
    },
  });

  const back = `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${proposal.shareToken}`;
  const signUrl = result.mock
    ? `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-sign?ref=${sig.id}&back=${encodeURIComponent(back)}`
    : result.signingUrl;

  await sendEmail({
    to: proposal.clientEmail,
    subject: `Please sign your agreement with ${proposal.tenant.name}`,
    html: `<p>Hi ${proposal.clientName},</p>
<p>Your agreement is ready to sign (${provider === 'docusign' ? 'DocuSign' : 'Aadhaar eSign'}).</p>
<p style="margin:24px 0"><a href="${signUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Sign agreement</a></p>
<p style="color:#666;font-size:12px">${signUrl}</p>`,
  }).catch(() => {});

  await audit({ tenantId: proposal.tenantId, userId: auth.user.id, action: 'send', entity: 'SignatureRequest', entityId: sig.id });
  return NextResponse.json({ requestId: sig.id, signUrl, provider: result.provider });
}
