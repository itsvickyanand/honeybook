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
import { logger } from '@/lib/logger';

const schema = z.object({ provider: z.enum(['digio', 'docusign']).optional() });

/** A bare-minimum syntactic email check. We never want to ship "id@no-email.demo"
 *  to DocuSign — it will 400-error the entire envelope. */
function isProbablyValidEmail(e: string | null | undefined): e is string {
  if (!e) return false;
  if (e.endsWith('.demo') || e.endsWith('.invalid') || e.endsWith('.example')) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    const provider: SignProvider = parsed.success && parsed.data.provider ? parsed.data.provider : 'digio';

    const p = await prisma.proposal.findUnique({
      where: { shareToken: token },
      include: { tenant: true, project: { select: { name: true, startDate: true } } },
    });
    if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!p.clientName) return NextResponse.json({ error: 'Client name missing on the proposal.' }, { status: 400 });

    // DocuSign and Aadhaar both reject placeholder/demo emails outright — refuse
    // the request early with a clear message instead of bubbling a 500 from the
    // provider API.
    if (provider === 'docusign' && !isProbablyValidEmail(p.clientEmail)) {
      return NextResponse.json(
        { error: 'DocuSign needs a real client email on the proposal. Add one and try again.' },
        { status: 400 },
      );
    }

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
    // NB: Do NOT silently fall back to HTML bytes — DocuSign rejects with
    // PDF_VALIDATION_FAILED and we lose visibility into the actual failure.
    let pdfBase64: string;
    try {
      const pdf = await htmlToPdf(docHtml);
      pdfBase64 = Buffer.from(pdf).toString('base64');
    } catch (e) {
      const message = (e as Error).message;
      logger.error({ err: message, proposalId: p.id }, 'sign.pdf.failed');
      return NextResponse.json(
        {
          error: `Could not render the contract PDF: ${message.slice(0, 240)}. ` +
            'Check that PDF_RUNTIME=serverless and that the Vercel build includes chromium.',
        },
        { status: 500 },
      );
    }

    // 3. Send to provider.
    let result;
    try {
      result = await createSignature({
        provider,
        signerName: p.clientName,
        signerEmail: p.clientEmail ?? '',
        pdfBase64,
        filename: `${p.title}-agreement.pdf`,
        returnUrl: `${process.env.APP_URL ?? 'http://localhost:3000'}/p/${token}?signed=1`,
      }, p.tenantId);
    } catch (e) {
      const message = (e as Error).message;
      logger.error({ err: message, provider, proposalId: p.id }, 'sign.provider.failed');
      // DocuSign's most common first-time error — surface the consent URL so it's actionable.
      if (message.includes('consent_required') || message.toLowerCase().includes('consent')) {
        return NextResponse.json(
          { error: 'DocuSign needs a one-time admin consent grant. Check server logs for the consent URL.' },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: `${provider} signature failed: ${message.slice(0, 240)}` },
        { status: 502 },
      );
    }

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

    return NextResponse.json({
      signUrl,
      requestId: sig.id,
      provider: result.provider,
      configured: providerConfigured(provider),
      mock: result.mock,
    });
  } catch (e) {
    logger.error({ err: (e as Error).message, token }, 'sign.route.unhandled');
    return NextResponse.json({ error: 'Could not start signing. Please try again or contact support.' }, { status: 500 });
  }
}
