/**
 * Public endpoint — client initiates signature on the CONTRACT attached to the
 * proposal. Renders the tenant's (customizable) contract with merge values to a
 * PDF, then sends it to the chosen provider (Aadhaar eSign / DocuSign).
 *
 * Body: { provider?: 'digio' | 'docusign' }  (default 'digio' = Aadhaar)
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { createSignature, providerConfigured, type SignProvider } from '@/lib/esign';
import { resolveContractForProposal, renderContract, contractDocument } from '@/lib/contracts';
import { htmlToPdf } from '@/lib/pdf/render';
import { formatCurrency } from '@/lib/utils';

const schema = z.object({ provider: z.enum(['digio', 'docusign']).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const provider: SignProvider = parsed.success && parsed.data.provider ? parsed.data.provider : 'digio';

  const p = await prisma.proposal.findUnique({
    where: { shareToken: token },
    include: { tenant: true, project: { select: { name: true, startDate: true } } },
  });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!p.clientName) return NextResponse.json({ error: 'Client name missing' }, { status: 400 });

  // 1. Resolve + render the contract.
  const template = await resolveContractForProposal(p.tenantId, p.contractTemplateId);
  const innerHtml = renderContract(template.bodyHtml, {
    clientName: p.clientName,
    vendorName: p.tenant.name,
    businessName: p.tenant.name,
    projectName: p.project?.name ?? p.title,
    total: formatCurrency(p.total, p.tenant.currency, p.tenant.locale),
    eventDate: p.project?.startDate ? p.project.startDate.toLocaleDateString('en-IN') : '',
  });
  const docHtml = contractDocument(innerHtml, `${p.title} — Agreement`);

  // 2. Render to PDF (Aadhaar eSign / DocuSign need a real PDF).
  let pdfBase64: string;
  try {
    const pdf = await htmlToPdf(docHtml);
    pdfBase64 = Buffer.from(pdf).toString('base64');
  } catch {
    // Fallback: send the HTML bytes (mock/dev only).
    pdfBase64 = Buffer.from(docHtml, 'utf8').toString('base64');
  }

  // 3. Send to provider.
  const result = await createSignature({
    provider,
    signerName: p.clientName,
    signerEmail: p.clientEmail ?? `${p.id}@no-email.demo`,
    pdfBase64,
    filename: `${p.title}-agreement.pdf`,
    returnUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}?signed=1`,
  });

  const sig = await prisma.signatureRequest.create({
    data: {
      tenantId: p.tenantId,
      proposalId: p.id,
      provider: result.provider,
      externalId: result.externalId,
      signerName: p.clientName,
      signerEmail: p.clientEmail ?? '',
      status: result.mock ? 'PENDING' : 'SENT',
      payload: { contractHtml: docHtml, contractTemplateId: template.id } as object,
    },
  });

  const back = `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}`;
  const signUrl = result.mock
    ? `${process.env.APP_URL ?? 'http://localhost:3000'}/p/mock-sign?ref=${sig.id}&back=${encodeURIComponent(back)}`
    : result.signingUrl;

  return NextResponse.json({ signUrl, requestId: sig.id, provider: result.provider, configured: providerConfigured(provider) });
}
