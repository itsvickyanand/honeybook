/**
 * Integration registry — a single source of truth for every external service
 * the platform talks to.
 *
 * Each entry declares:
 *   - `scope`: 'platform' (configured by the SaaS operator) or 'tenant' (per vendor)
 *   - `kind`: how it connects (oauth | apiKey | webhook | builtin)
 *   - `envKeys`: env vars that, if present, give the integration a default
 *     credential set without requiring per-tenant configuration
 *   - `connectStrategy`: where the connect flow lives in the UI
 *   - `optional`: true for analytics/observability that the product runs
 *     without; false for revenue-critical paths
 *
 * Used by:
 *   - /admin/integrations (platform admin connects platform-scoped providers)
 *   - /app/settings/integrations (tenant connects tenant-scoped providers)
 *   - Runtime helpers in /src/lib/integrations/resolve.ts — looks up credentials
 *     from the Integration table first, falls back to env vars.
 */
export type IntegrationScope = 'platform' | 'tenant';
export type IntegrationKind = 'oauth' | 'apiKey' | 'webhook' | 'builtin';

export interface IntegrationSpec {
  provider: string;
  displayName: string;
  category: 'payments' | 'comms' | 'calendar' | 'esign' | 'accounting' | 'storage' | 'ai' | 'observability' | 'compliance' | 'scheduling';
  scope: IntegrationScope;
  kind: IntegrationKind;
  description: string;
  docsUrl?: string;
  envKeys?: string[];
  /** Tenant-level integrations that are also valid as platform fallbacks. */
  fallbackToPlatform?: boolean;
  /** Field-level shape for the connect form (apiKey kind only). */
  fields?: { key: string; label: string; type: 'text' | 'password' | 'url' | 'textarea'; required?: boolean; helpText?: string }[];
  /** Vercel-side public callback path for OAuth-kind integrations. */
  oauthCallback?: string;
  optional: boolean;
}

const SPECS: IntegrationSpec[] = [
  // ─── Payments ──────────────────────────────────────────────────────────────
  {
    provider: 'razorpay',
    displayName: 'Razorpay',
    category: 'payments',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Accept UPI, cards, netbanking payments from Indian clients.',
    docsUrl: 'https://razorpay.com/docs/payments/dashboard/account-settings/api-keys/',
    envKeys: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    fallbackToPlatform: true,
    fields: [
      { key: 'keyId', label: 'Key ID', type: 'text', required: true, helpText: 'Starts with rzp_live_ or rzp_test_' },
      { key: 'keySecret', label: 'Key Secret', type: 'password', required: true },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: true, helpText: 'Set in Razorpay dashboard under Webhooks' },
    ],
    optional: false,
  },
  {
    provider: 'stripe',
    displayName: 'Stripe',
    category: 'payments',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Accept cards from international clients.',
    docsUrl: 'https://stripe.com/docs/keys',
    envKeys: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    fallbackToPlatform: true,
    fields: [
      { key: 'secretKey', label: 'Secret key', type: 'password', required: true, helpText: 'sk_live_… or sk_test_…' },
      { key: 'webhookSecret', label: 'Webhook signing secret', type: 'password', required: true },
    ],
    optional: true,
  },

  // ─── Communications ────────────────────────────────────────────────────────
  {
    provider: 'resend',
    displayName: 'Resend',
    category: 'comms',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Transactional emails (receipts, proposals, reminders).',
    docsUrl: 'https://resend.com/docs',
    envKeys: ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'],
    fallbackToPlatform: true,
    fields: [
      { key: 'apiKey', label: 'API key', type: 'password', required: true, helpText: 're_…' },
      { key: 'fromEmail', label: 'From address', type: 'text', required: true, helpText: 'Domain must be verified in Resend' },
    ],
    optional: false,
  },
  {
    provider: 'msg91',
    displayName: 'MSG91 SMS',
    category: 'comms',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Transactional SMS to Indian phone numbers (OTPs, reminders).',
    docsUrl: 'https://msg91.com/help/sms-api-docs',
    envKeys: ['MSG91_AUTH_KEY', 'MSG91_SENDER_ID', 'MSG91_TEMPLATE_ID_OTP'],
    fallbackToPlatform: true,
    fields: [
      { key: 'authKey', label: 'Auth key', type: 'password', required: true },
      { key: 'senderId', label: 'Sender ID', type: 'text', required: true, helpText: '6-character DLT-approved sender' },
    ],
    optional: true,
  },
  {
    provider: 'whatsapp_bsp',
    displayName: 'WhatsApp Cloud API',
    category: 'comms',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Send template messages via Meta/Gupshup/Interakt.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    envKeys: ['WHATSAPP_BSP', 'WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
    fields: [
      { key: 'bsp', label: 'BSP', type: 'text', required: true, helpText: 'meta | gupshup | interakt' },
      { key: 'token', label: 'Access token', type: 'password', required: true },
      { key: 'phoneId', label: 'Phone number ID', type: 'text', required: true },
    ],
    optional: true,
  },
  {
    provider: 'gmail',
    displayName: 'Gmail',
    category: 'comms',
    scope: 'tenant',
    kind: 'oauth',
    description: 'Send proposal emails through the vendor\'s own Gmail account (better deliverability).',
    docsUrl: 'https://developers.google.com/gmail/api/auth/scopes',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/google/callback',
    optional: true,
  },

  // ─── Calendar ──────────────────────────────────────────────────────────────
  {
    provider: 'google_calendar',
    displayName: 'Google Calendar',
    category: 'calendar',
    scope: 'tenant',
    kind: 'oauth',
    description: 'Two-way sync of bookings between Calendar and the project pipeline.',
    docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
    envKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/google/callback',
    fallbackToPlatform: true,
    optional: false,
  },

  // ─── Scheduling ────────────────────────────────────────────────────────────
  {
    provider: 'calendly',
    displayName: 'Calendly',
    category: 'scheduling',
    scope: 'platform', // platform-level per user request — for SaaS sales calls
    kind: 'oauth',
    description: 'Embed scheduling links + auto-create projects when a meeting is booked.',
    docsUrl: 'https://developer.calendly.com/api-docs',
    envKeys: ['CALENDLY_CLIENT_ID', 'CALENDLY_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/calendly/callback',
    optional: true,
  },
  {
    provider: 'zoom',
    displayName: 'Zoom',
    category: 'scheduling',
    scope: 'tenant',
    kind: 'oauth',
    description: 'Generate meeting links automatically when a call is scheduled.',
    docsUrl: 'https://developers.zoom.us/docs/api/',
    envKeys: ['ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/zoom/callback',
    optional: true,
  },

  // ─── e-Sign ────────────────────────────────────────────────────────────────
  {
    provider: 'digio',
    displayName: 'Digio',
    category: 'esign',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Aadhaar-based e-sign on contracts (legally binding in India).',
    docsUrl: 'https://docs.digio.in/',
    envKeys: ['DIGIO_CLIENT_ID', 'DIGIO_CLIENT_SECRET'],
    fallbackToPlatform: true,
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client secret', type: 'password', required: true },
      { key: 'env', label: 'Environment', type: 'text', required: true, helpText: 'sandbox | production' },
    ],
    optional: true,
  },
  {
    provider: 'docusign',
    displayName: 'DocuSign',
    category: 'esign',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Enterprise e-sign via JWT Grant — clients sign embedded in your portal.',
    docsUrl: 'https://developers.docusign.com/platform/auth/jwt/',
    envKeys: ['DOCUSIGN_INTEGRATION_KEY', 'DOCUSIGN_USER_ID', 'DOCUSIGN_PRIVATE_KEY', 'DOCUSIGN_OAUTH_HOST', 'DOCUSIGN_BASE_URI', 'DOCUSIGN_ACCOUNT_ID'],
    fallbackToPlatform: true,
    fields: [
      { key: 'integrationKey', label: 'Integration Key (Client ID)', type: 'text', required: true },
      { key: 'userId', label: 'API User ID (GUID)', type: 'text', required: true },
      { key: 'privateKey', label: 'RSA private key (PEM)', type: 'textarea', required: true, helpText: 'Paste the full -----BEGIN RSA PRIVATE KEY----- block.' },
      { key: 'oauthHost', label: 'OAuth host', type: 'text', required: true, helpText: 'account-d.docusign.com (sandbox) or account.docusign.com (live)' },
      { key: 'baseUri', label: 'Base URI', type: 'text', required: true, helpText: 'https://demo.docusign.net or https://www.docusign.net' },
      { key: 'accountId', label: 'API Account ID', type: 'text', required: true },
    ],
    optional: true,
  },

  // ─── Accounting ────────────────────────────────────────────────────────────
  {
    provider: 'zoho_books',
    displayName: 'Zoho Books',
    category: 'accounting',
    scope: 'tenant',
    kind: 'oauth',
    description: 'Push invoices + payments to your books in real-time.',
    docsUrl: 'https://www.zoho.com/books/api/v3/oauth/',
    envKeys: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/zoho/callback',
    optional: true,
  },
  {
    provider: 'tally',
    displayName: 'Tally',
    category: 'accounting',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Sync invoices via the Tally on-prem agent (XML envelope).',
    docsUrl: 'https://help.tallysolutions.com/',
    fields: [
      { key: 'agentToken', label: 'Agent pairing token', type: 'password', required: true, helpText: 'Generated when first connecting the Tally agent' },
    ],
    optional: true,
  },
  {
    provider: 'quickbooks',
    displayName: 'QuickBooks',
    category: 'accounting',
    scope: 'tenant',
    kind: 'oauth',
    description: 'Sync invoices to QuickBooks Online (non-IN markets).',
    envKeys: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'],
    oauthCallback: '/api/oauth/quickbooks/callback',
    optional: true,
  },

  // ─── Compliance (India GST) ────────────────────────────────────────────────
  {
    provider: 'gst_irp',
    displayName: 'GST IRP (E-invoicing)',
    category: 'compliance',
    scope: 'tenant',
    kind: 'apiKey',
    description: 'Submit B2B invoices to GSTN IRP for IRN + signed QR. Mandatory above ₹5Cr.',
    docsUrl: 'https://einvoice1.gst.gov.in/',
    envKeys: ['GST_IRP_PROVIDER', 'GST_IRP_KEY', 'GST_IRP_USERNAME', 'GST_IRP_PASSWORD'],
    fallbackToPlatform: true,
    fields: [
      { key: 'provider', label: 'Aggregator', type: 'text', required: true, helpText: 'masters_india | cygnet | irisgst | cleartax' },
      { key: 'apiKey', label: 'API key', type: 'password', required: true },
      { key: 'username', label: 'GSTN username', type: 'text', required: true },
      { key: 'password', label: 'GSTN password', type: 'password', required: true },
    ],
    optional: true,
  },

  // ─── Storage ───────────────────────────────────────────────────────────────
  {
    provider: 'cloudflare_r2',
    displayName: 'Cloudflare R2',
    category: 'storage',
    scope: 'platform',
    kind: 'apiKey',
    description: 'Object storage for file uploads (signed URLs).',
    docsUrl: 'https://developers.cloudflare.com/r2/api/s3/api/',
    envKeys: ['S3_ENDPOINT', 'S3_ACCESS_KEY', 'S3_SECRET_KEY', 'S3_BUCKET', 'STORAGE_DRIVER', 'S3_REGION', 'S3_FORCE_PATH_STYLE'],
    optional: false,
  },

  // ─── AI ────────────────────────────────────────────────────────────────────
  {
    provider: 'anthropic',
    displayName: 'Anthropic Claude',
    category: 'ai',
    scope: 'platform',
    kind: 'apiKey',
    description: 'Powers proposal generation, smart templates, and document drafting.',
    docsUrl: 'https://docs.anthropic.com/',
    envKeys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'],
    optional: false,
  },
  {
    provider: 'voyage',
    displayName: 'Voyage AI Embeddings',
    category: 'ai',
    scope: 'platform',
    kind: 'apiKey',
    description: 'Embeddings for semantic search across the catalog + past projects.',
    envKeys: ['VOYAGE_API_KEY'],
    optional: true,
  },
  {
    provider: 'openai',
    displayName: 'OpenAI Embeddings',
    category: 'ai',
    scope: 'platform',
    kind: 'apiKey',
    description: 'Alternative embeddings provider (text-embedding-3-small).',
    envKeys: ['OPENAI_API_KEY'],
    optional: true,
  },

  // ─── Observability ─────────────────────────────────────────────────────────
  {
    provider: 'sentry',
    displayName: 'Sentry',
    category: 'observability',
    scope: 'platform',
    kind: 'apiKey',
    description: 'Error tracking + performance monitoring.',
    docsUrl: 'https://docs.sentry.io/',
    envKeys: ['SENTRY_DSN', 'SENTRY_AUTH_TOKEN'],
    optional: true,
  },

  // ─── Infra (Redis) ─────────────────────────────────────────────────────────
  {
    provider: 'redis_cloud',
    displayName: 'Redis Cloud',
    category: 'observability', // closest existing category; rendered separately in UI
    scope: 'platform',
    kind: 'apiKey',
    description: 'Backs BullMQ workers + rate-limiting + caching.',
    docsUrl: 'https://redis.io/docs/management/cli/',
    envKeys: ['REDIS_URL'],
    optional: false,
  },
];

export const INTEGRATIONS: IntegrationSpec[] = SPECS;

export function getSpec(provider: string): IntegrationSpec | undefined {
  return SPECS.find((s) => s.provider === provider);
}

export function specsForScope(scope: IntegrationScope): IntegrationSpec[] {
  return SPECS.filter((s) => s.scope === scope);
}
