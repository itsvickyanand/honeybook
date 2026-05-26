/**
 * Server-side helper: detect which integrations are in mock vs real mode.
 * Drives the TestModeBanner + UI affordances in the dashboard.
 */
export interface IntegrationStatus {
  ai: boolean;
  embeddings: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  payments: boolean;
  esign: boolean;
  gstIrp: boolean;
  zoho: boolean;
  googleCalendar: boolean;
  sentry: boolean;
}

export function integrationStatus(): IntegrationStatus {
  return {
    ai: !!process.env.ANTHROPIC_API_KEY,
    embeddings: !!process.env.VOYAGE_API_KEY || !!process.env.OPENAI_API_KEY,
    email: !!process.env.RESEND_API_KEY,
    sms: !!process.env.MSG91_AUTH_KEY,
    whatsapp: !!process.env.WHATSAPP_TOKEN,
    payments: !!process.env.RAZORPAY_KEY_ID,
    esign: !!process.env.DIGIO_CLIENT_ID,
    gstIrp: !!process.env.GST_IRP_PROVIDER && process.env.GST_IRP_PROVIDER !== 'mock',
    zoho: !!process.env.ZOHO_CLIENT_ID,
    googleCalendar: !!process.env.GOOGLE_CLIENT_ID,
    sentry: !!process.env.SENTRY_DSN,
  };
}

export function isAnyMocked(s: IntegrationStatus = integrationStatus()): boolean {
  return !s.email || !s.payments || !s.esign;
}

export function mockedList(s: IntegrationStatus = integrationStatus()): string[] {
  const list: string[] = [];
  if (!s.ai) list.push('Claude');
  if (!s.embeddings) list.push('Embeddings');
  if (!s.email) list.push('Email');
  if (!s.sms) list.push('SMS');
  if (!s.whatsapp) list.push('WhatsApp');
  if (!s.payments) list.push('Razorpay');
  if (!s.esign) list.push('eSign');
  if (!s.gstIrp) list.push('GST IRN');
  if (!s.zoho) list.push('Zoho');
  if (!s.googleCalendar) list.push('Google Calendar');
  return list;
}
