/**
 * Email an invoice to any recipient. Mints a public View+Pay link, attaches a
 * download link, and sends via the comms facade (works inline without a worker).
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { requireApi } from '@/lib/api';
import { prisma } from '@/lib/db';
import { markInvoiceSent } from '@/lib/invoice';
import { sendEmail } from '@/lib/comms';
import { formatCurrency } from '@/lib/utils';
import { audit } from '@/lib/audit';

const schema = z.object({
  to: z.string().email().optional(),
  message: z.string().max(2000).optional(),
});

function appUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireApi('proposal.send');
  if ('error' in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  let invoice = await prisma.invoice.findFirst({ where: { id, tenantId: auth.tenant.id } });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (invoice.status === 'VOID') return NextResponse.json({ error: 'Invoice is void' }, { status: 400 });

  // Resolve recipient: explicit > linked contact email.
  let to = parsed.data.to;
  if (!to && invoice.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: invoice.contactId }, select: { email: true } });
    to = contact?.email ?? undefined;
  }
  if (!to) return NextResponse.json({ error: 'No recipient email — provide one' }, { status: 400 });

  // Ensure numbered + shareable.
  if (invoice.status === 'DRAFT') invoice = await markInvoiceSent(invoice.id);
  if (!invoice.shareToken) {
    const token = randomBytes(18).toString('base64url');
    invoice = await prisma.invoice.update({ where: { id: invoice.id }, data: { shareToken: token } });
  }

  const tenant = auth.tenant;
  const viewUrl = `${appUrl()}/i/${invoice.shareToken}`;
  const balance = Math.max(0, invoice.total - invoice.amountPaid);
  const intro = parsed.data.message
    ? `<p>${parsed.data.message.replace(/</g, '&lt;')}</p>`
    : '';

  await sendEmail({
    to,
    subject: `Invoice ${invoice.number} from ${tenant.name}`,
    html: `<p>Hi,</p>
${intro}
<p>Please find your invoice <strong>${invoice.number}</strong> for <strong>${formatCurrency(invoice.total, tenant.currency, tenant.locale)}</strong>${
      balance > 0 ? ` (balance due ${formatCurrency(balance, tenant.currency, tenant.locale)})` : ''
    }.</p>
<p style="margin:24px 0">
  <a href="${viewUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">View & pay invoice</a>
</p>
<p style="color:#666;font-size:12px">Or paste this link in your browser:<br/>${viewUrl}</p>
<p style="color:#666;font-size:12px">— ${tenant.name}</p>`,
  });

  await audit({
    tenantId: tenant.id,
    userId: auth.user.id,
    action: 'send',
    entity: 'Invoice',
    entityId: invoice.id,
  });

  return NextResponse.json({ ok: true, to, url: viewUrl });
}
