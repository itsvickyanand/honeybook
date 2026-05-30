/**
 * Transactional email + WhatsApp templates.
 * Plain functions returning the channel-specific payloads — callers enqueue.
 */
import { formatCurrency } from '../utils';

export interface ProposalSentTemplate {
  clientName: string;
  vendorName: string;
  portalUrl: string;
  total: number;
  currency: string;
  locale: string;
}

export function emailProposalSent(args: ProposalSentTemplate) {
  return {
    subject: `Your proposal from ${args.vendorName}`,
    text: `Hi ${args.clientName},\n\n${args.vendorName} has prepared a proposal for you. Review it here: ${args.portalUrl}\n\nTotal: ${formatCurrency(args.total, args.currency, args.locale)}\n\n— Team ${args.vendorName}`,
    html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <h1 style="font-size:24px;margin:0 0 12px">Your proposal from ${args.vendorName}</h1>
  <p>Hi ${args.clientName},</p>
  <p>We've put together a proposal for you. Review every detail — and ask for changes if anything needs adjusting.</p>
  <p style="margin:24px 0">
    <a href="${args.portalUrl}" style="background:linear-gradient(90deg,#8b5cf6,#ec4899);color:white;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">Open proposal</a>
  </p>
  <p style="color:#666">Total: <strong>${formatCurrency(args.total, args.currency, args.locale)}</strong></p>
  <p style="color:#999;font-size:12px;margin-top:32px">Sent via Avantus</p>
</div>`,
  };
}

export interface PaymentReceivedTemplate {
  clientName: string;
  vendorName: string;
  amount: number;
  currency: string;
  locale: string;
  invoiceNumber: string;
}

export function emailPaymentReceived(args: PaymentReceivedTemplate) {
  return {
    subject: `Payment received · Invoice ${args.invoiceNumber}`,
    text: `Hi ${args.clientName},\n\nWe've received your payment of ${formatCurrency(args.amount, args.currency, args.locale)} against invoice ${args.invoiceNumber}.\n\n— Team ${args.vendorName}`,
    html: `<p>Hi ${args.clientName}, your payment of <strong>${formatCurrency(args.amount, args.currency, args.locale)}</strong> against invoice ${args.invoiceNumber} has been received. Thank you!</p>`,
  };
}

export interface InvoiceOverdueTemplate {
  clientName: string;
  amountDue: number;
  currency: string;
  locale: string;
  invoiceNumber: string;
  payUrl: string;
}

export function emailInvoiceOverdue(args: InvoiceOverdueTemplate) {
  return {
    subject: `Reminder · Invoice ${args.invoiceNumber} is overdue`,
    text: `Hi ${args.clientName}, this is a reminder that invoice ${args.invoiceNumber} for ${formatCurrency(args.amountDue, args.currency, args.locale)} is past its due date. Pay here: ${args.payUrl}`,
    html: `<p>Hi ${args.clientName},</p>
<p>Just a gentle reminder — invoice <strong>${args.invoiceNumber}</strong> for ${formatCurrency(args.amountDue, args.currency, args.locale)} is past its due date.</p>
<p><a href="${args.payUrl}">Pay now</a></p>`,
  };
}
