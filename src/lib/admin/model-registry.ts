/**
 * Admin DB browser — registry of browsable models.
 *
 * Each entry defines:
 *   key         the Prisma delegate name (lowercase first letter)
 *   label       human display name
 *   group       grouping in sidebar
 *   primaryCol  column shown in row header
 *   listCols    columns visible in the list table
 *   searchCols  string columns to OR-match for search
 *   tenantCol   the column linking to tenant (used for filter + scoping)
 *   defaultSort default order
 *
 * Sensitive models (PasswordReset, OtpChallenge, PlatformAdmin) are
 * intentionally OMITTED — they hold creds or auth secrets and shouldn't be
 * idly browsed.
 */
export type FieldType =
  | 'string' | 'text' | 'number' | 'boolean' | 'date' | 'json' | 'enum' | 'ref';

export interface ColumnSpec {
  key: string;
  label?: string;
  type?: FieldType;
  /** When `type=ref`, links to the model with this key. */
  refModel?: string;
  /** Width hint for the list view, e.g. 'w-24'. */
  width?: string;
}

export interface ModelSpec {
  key: string;             // Prisma delegate, e.g. 'tenant'
  label: string;           // "Tenants"
  group: 'core' | 'leads' | 'proposals' | 'money' | 'delivery' | 'comms' | 'integrations' | 'system';
  primaryCol: string;      // header column
  subTitleCol?: string;    // optional second line in row header
  listCols: ColumnSpec[];
  searchCols: string[];
  tenantCol?: string;      // 'tenantId' on most, undefined on platform-level models
  defaultSort?: { col: string; dir: 'asc' | 'desc' };
  /** When true, list view auto-includes a tenant filter chip. */
  showsTenantFilter?: boolean;
}

export const MODEL_REGISTRY: ModelSpec[] = [
  // ─── Core ──────────────────────────────────────────────────────────────
  {
    key: 'tenant', label: 'Tenants', group: 'core',
    primaryCol: 'name', subTitleCol: 'slug',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'slug', type: 'string', width: 'w-40' },
      { key: 'currency', type: 'string', width: 'w-20' },
      { key: 'locale', type: 'string', width: 'w-20' },
      { key: 'onboardingCompletedAt', label: 'Onboarded', type: 'date', width: 'w-32' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name', 'slug'],
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'user', label: 'Users', group: 'core',
    primaryCol: 'email', subTitleCol: 'fullName',
    listCols: [
      { key: 'email', type: 'string' },
      { key: 'fullName', label: 'Name', type: 'string' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'roleId', label: 'Role', type: 'ref', refModel: 'role', width: 'w-32' },
      { key: 'lastLoginAt', label: 'Last login', type: 'date', width: 'w-32' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['email', 'fullName', 'phone'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'role', label: 'Roles', group: 'core',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'isSystem', label: 'System', type: 'boolean', width: 'w-20' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'team', label: 'Teams', group: 'core',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'leadUserId', label: 'Lead', type: 'ref', refModel: 'user', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'contact', label: 'Contacts', group: 'core',
    primaryCol: 'fullName', subTitleCol: 'email',
    listCols: [
      { key: 'fullName', label: 'Name', type: 'string' },
      { key: 'email', type: 'string' },
      { key: 'phone', type: 'string', width: 'w-32' },
      { key: 'source', type: 'string', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['fullName', 'email', 'phone'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },

  // ─── Leads ─────────────────────────────────────────────────────────────
  {
    key: 'lead', label: 'Leads', group: 'leads',
    primaryCol: 'title',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'source', type: 'string', width: 'w-32' },
      { key: 'value', type: 'number', width: 'w-24' },
      { key: 'score', type: 'number', width: 'w-16' },
      { key: 'stageId', label: 'Stage', type: 'ref', refModel: 'stage', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title', 'source', 'notes'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'leadForm', label: 'Lead Forms', group: 'leads',
    primaryCol: 'name', subTitleCol: 'slug',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'slug', type: 'string', width: 'w-48' },
      { key: 'formType', type: 'string', width: 'w-32' },
      { key: 'category', type: 'string', width: 'w-24' },
      { key: 'active', type: 'boolean', width: 'w-16' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name', 'slug'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'formSubmission', label: 'Form Submissions', group: 'leads',
    primaryCol: 'id',
    listCols: [
      { key: 'formId', label: 'Form', type: 'ref', refModel: 'leadForm', width: 'w-40' },
      { key: 'contactId', label: 'Contact', type: 'ref', refModel: 'contact', width: 'w-40' },
      { key: 'leadId', label: 'Lead', type: 'ref', refModel: 'lead', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: [],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'pipeline', label: 'Pipelines', group: 'leads',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'isDefault', type: 'boolean', width: 'w-20' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },

  // ─── Proposals ─────────────────────────────────────────────────────────
  {
    key: 'proposal', label: 'Proposals', group: 'proposals',
    primaryCol: 'title', subTitleCol: 'clientName',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'clientName', type: 'string', width: 'w-40' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'total', type: 'number', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title', 'clientName', 'clientEmail'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'proposalTemplate', label: 'Proposal Templates', group: 'proposals',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'isDefault', type: 'boolean', width: 'w-20' },
      { key: 'archived', type: 'boolean', width: 'w-20' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'contractTemplate', label: 'Contract Templates', group: 'proposals',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'isDefault', type: 'boolean', width: 'w-20' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'signatureRequest', label: 'Signatures', group: 'proposals',
    primaryCol: 'externalId',
    listCols: [
      { key: 'provider', type: 'string', width: 'w-24' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'signerEmail', type: 'string', width: 'w-48' },
      { key: 'proposalId', label: 'Proposal', type: 'ref', refModel: 'proposal', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['externalId', 'signerEmail'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },

  // ─── Money ─────────────────────────────────────────────────────────────
  {
    key: 'invoice', label: 'Invoices', group: 'money',
    primaryCol: 'number',
    listCols: [
      { key: 'number', type: 'string', width: 'w-32' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'total', type: 'number', width: 'w-24' },
      { key: 'amountPaid', label: 'Paid', type: 'number', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['number'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'payment', label: 'Payments', group: 'money',
    primaryCol: 'id',
    listCols: [
      { key: 'method', type: 'string', width: 'w-24' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'amount', type: 'number', width: 'w-24' },
      { key: 'invoiceId', label: 'Invoice', type: 'ref', refModel: 'invoice', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'paidAt', type: 'date', width: 'w-32' },
    ],
    searchCols: [],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'paidAt', dir: 'desc' },
  },
  {
    key: 'paymentSchedule', label: 'Payment Schedules', group: 'money',
    primaryCol: 'id',
    listCols: [
      { key: 'projectId', label: 'Project', type: 'ref', refModel: 'project', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: [],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'mandate', label: 'AutoPay Mandates', group: 'money',
    primaryCol: 'externalId',
    listCols: [
      { key: 'externalId', type: 'string', width: 'w-40' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['externalId'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },

  // ─── Delivery ──────────────────────────────────────────────────────────
  {
    key: 'project', label: 'Projects', group: 'delivery',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'stage', type: 'string', width: 'w-28' },
      { key: 'totalValue', label: 'Value', type: 'number', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'task', label: 'Tasks', group: 'delivery',
    primaryCol: 'title',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'priority', type: 'string', width: 'w-20' },
      { key: 'projectId', label: 'Project', type: 'ref', refModel: 'project', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'dueDate', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'calendarEvent', label: 'Calendar Events', group: 'delivery',
    primaryCol: 'title',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'kind', type: 'string', width: 'w-24' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'startAt', label: 'Starts', type: 'date', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['title'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'startAt', dir: 'desc' },
  },
  {
    key: 'document', label: 'Documents', group: 'delivery',
    primaryCol: 'title',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'category', type: 'string', width: 'w-24' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'fileObject', label: 'Files', group: 'delivery',
    primaryCol: 'filename',
    listCols: [
      { key: 'filename', type: 'string' },
      { key: 'mimeType', type: 'string', width: 'w-32' },
      { key: 'bytes', label: 'Size', type: 'number', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['filename'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },

  // ─── Comms ─────────────────────────────────────────────────────────────
  {
    key: 'notification', label: 'Notifications', group: 'comms',
    primaryCol: 'title',
    listCols: [
      { key: 'title', type: 'string' },
      { key: 'type', type: 'string', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title', 'body'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'message', label: 'Messages', group: 'comms',
    primaryCol: 'id',
    listCols: [
      { key: 'direction', type: 'string', width: 'w-24' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'threadId', label: 'Thread', type: 'ref', refModel: 'chatThread', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['body'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'chatThread', label: 'Chat Threads', group: 'comms',
    primaryCol: 'id',
    listCols: [
      { key: 'channel', type: 'string', width: 'w-24' },
      { key: 'contactId', label: 'Contact', type: 'ref', refModel: 'contact', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'lastMessageAt', type: 'date', width: 'w-32' },
    ],
    searchCols: [],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'dripSequence', label: 'Drip Sequences', group: 'comms',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'trigger', type: 'string', width: 'w-32' },
      { key: 'active', type: 'boolean', width: 'w-16' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['name'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'review', label: 'Reviews', group: 'comms',
    primaryCol: 'id',
    listCols: [
      { key: 'rating', type: 'number', width: 'w-16' },
      { key: 'projectId', label: 'Project', type: 'ref', refModel: 'project', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['body'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },

  // ─── Integrations ──────────────────────────────────────────────────────
  {
    key: 'integration', label: 'Integrations', group: 'integrations',
    primaryCol: 'provider',
    listCols: [
      { key: 'provider', type: 'string', width: 'w-32' },
      { key: 'scope', type: 'string', width: 'w-20' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'accountEmail', label: 'Account', type: 'string' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'updatedAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['provider', 'accountEmail'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'updatedAt', dir: 'desc' },
  },
  {
    key: 'apiKey', label: 'API Keys', group: 'integrations',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'keyPrefix', type: 'string', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['name', 'keyPrefix'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'paymentWebhook', label: 'Payment Webhooks', group: 'integrations',
    primaryCol: 'id',
    listCols: [
      { key: 'provider', type: 'string', width: 'w-24' },
      { key: 'eventType', type: 'string', width: 'w-40' },
      { key: 'processedAt', type: 'date', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['eventType'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'webhookEvent', label: 'Webhook Events', group: 'integrations',
    primaryCol: 'id',
    listCols: [
      { key: 'provider', type: 'string', width: 'w-24' },
      { key: 'eventType', type: 'string', width: 'w-40' },
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['eventType'],
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },

  // ─── System ────────────────────────────────────────────────────────────
  {
    key: 'auditLog', label: 'Tenant Audit Log', group: 'system',
    primaryCol: 'action',
    listCols: [
      { key: 'action', type: 'string', width: 'w-40' },
      { key: 'entity', type: 'string', width: 'w-32' },
      { key: 'entityId', type: 'string', width: 'w-40' },
      { key: 'userId', label: 'User', type: 'ref', refModel: 'user', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'at', label: 'When', type: 'date', width: 'w-40' },
    ],
    searchCols: ['action', 'entity', 'entityId'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'at', dir: 'desc' },
  },
  {
    key: 'platformAuditLog', label: 'Platform Audit Log', group: 'system',
    primaryCol: 'action',
    listCols: [
      { key: 'action', type: 'string', width: 'w-40' },
      { key: 'entity', type: 'string', width: 'w-32' },
      { key: 'entityId', type: 'string', width: 'w-40' },
      { key: 'adminId', label: 'Admin', type: 'string', width: 'w-40' },
      { key: 'at', label: 'When', type: 'date', width: 'w-40' },
    ],
    searchCols: ['action', 'entity', 'entityId'],
    defaultSort: { col: 'at', dir: 'desc' },
  },
  {
    key: 'activity', label: 'Activity', group: 'system',
    primaryCol: 'title',
    listCols: [
      { key: 'type', type: 'string', width: 'w-32' },
      { key: 'title', type: 'string' },
      { key: 'projectId', label: 'Project', type: 'ref', refModel: 'project', width: 'w-40' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
    ],
    searchCols: ['title'],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'onboardingSession', label: 'Onboarding Sessions', group: 'system',
    primaryCol: 'id',
    listCols: [
      { key: 'status', type: 'string', width: 'w-24' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
      { key: 'createdAt', type: 'date', width: 'w-32' },
      { key: 'completedAt', type: 'date', width: 'w-32' },
    ],
    searchCols: [],
    tenantCol: 'tenantId', showsTenantFilter: true,
    defaultSort: { col: 'createdAt', dir: 'desc' },
  },
  {
    key: 'userInvite', label: 'User Invites', group: 'system',
    primaryCol: 'email',
    listCols: [
      { key: 'email', type: 'string' },
      { key: 'acceptedAt', type: 'date', width: 'w-32' },
      { key: 'expiresAt', type: 'date', width: 'w-32' },
      { key: 'tenantId', type: 'ref', refModel: 'tenant', width: 'w-40' },
    ],
    searchCols: ['email'],
    tenantCol: 'tenantId', showsTenantFilter: true,
  },
  {
    key: 'businessType', label: 'Business Types', group: 'system',
    primaryCol: 'name',
    listCols: [
      { key: 'name', type: 'string' },
      { key: 'slug', type: 'string', width: 'w-32' },
    ],
    searchCols: ['name', 'slug'],
  },
];

export function getModel(key: string): ModelSpec | null {
  return MODEL_REGISTRY.find((m) => m.key.toLowerCase() === key.toLowerCase()) ?? null;
}

export const MODEL_GROUPS = {
  core: 'Core',
  leads: 'Leads',
  proposals: 'Proposals',
  money: 'Money',
  delivery: 'Delivery',
  comms: 'Comms',
  integrations: 'Integrations',
  system: 'System',
} as const;
