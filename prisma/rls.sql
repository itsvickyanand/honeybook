-- Row-Level Security policies (BRD Addendum v1.2 Fix 13).
--
-- Two deployment shapes are supported:
--
--   A. Self-managed Postgres (local dev, docker, RDS w/ superuser).
--      A dedicated non-BYPASSRLS role `honeybook_app` is provisioned and the
--      app connects as that role. Migrations/seed run as the owner which has
--      BYPASSRLS.
--
--   B. Managed Postgres without CREATE ROLE (Neon, Supabase pooler, etc.).
--      The app connects as the only role the provider gives us, and that role
--      is also the table owner. CREATE ROLE / GRANT are silently skipped.
--      RLS still applies because every tenant-scoped table is FORCEd, so even
--      the owner is subject to policies.
--
-- Every transaction that touches tenant data MUST set:
--   SET LOCAL app.current_tenant_id = '<tenant-id>';
-- See src/lib/db-rls.ts.
--
-- Run AFTER prisma db push, against the direct (non-pooled) URL:
--   DATABASE_URL=$DIRECT_URL npx tsx scripts/run-sql.ts prisma/rls.sql

-- 1. Application role + grants (skipped on managed Postgres).
DO $$
BEGIN
  IF current_setting('is_superuser')::boolean THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'honeybook_app') THEN
      EXECUTE 'CREATE ROLE honeybook_app LOGIN PASSWORD ''honeybook_app''';
    END IF;
    EXECUTE 'GRANT USAGE ON SCHEMA public TO honeybook_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO honeybook_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO honeybook_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO honeybook_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO honeybook_app';
    RAISE NOTICE 'honeybook_app role provisioned (self-managed mode)';
  ELSE
    RAISE NOTICE 'Skipping CREATE ROLE — running on managed Postgres as %', current_user;
  END IF;
END $$;

-- 2. Enable + FORCE RLS on every tenant-scoped table.
--    FORCE is essential on Neon: the app user IS the table owner, and without
--    FORCE the owner bypasses RLS entirely.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'Tenant',
      'Role', 'User', 'UserInvite',
      'CustomTable',
      'Contact', 'Pipeline', 'Lead', 'Activity',
      'Proposal', 'ProposalEvent', 'TenantAIConfig',
      -- ProposalEvent has no tenantId of its own; isolated via Proposal join below.
      'InvoiceSequence', 'Invoice', 'Payment',
      'SignatureRequest', 'FileObject', 'Gallery', 'Document',
      'ChatThread', 'Message',
      'CalendarEvent',
      'AccountingConnection', 'AccountingSyncLog',
      'PortalTemplate', 'WebhookEvent', 'Notification',
      'LeadForm', 'LeadScoringRule',
      'DripSequence', 'DripEnrollment',
      'Project',
      'ApiKey', 'OutboundWebhook',
      'AuditLog'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 3. Standard policy: row is visible iff its tenantId matches the session GUC.
--    `current_setting(..., true)` returns NULL when unset, so any query that
--    forgets `SET LOCAL app.current_tenant_id` returns zero rows (fail closed).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'Role','User','UserInvite','CustomTable','Contact','Pipeline','Lead','Activity',
      'Proposal','TenantAIConfig','InvoiceSequence','Invoice','Payment',
      'SignatureRequest','FileObject','Gallery','Document','ChatThread','Message',
      'CalendarEvent','AccountingConnection','AccountingSyncLog','PortalTemplate',
      'WebhookEvent','Notification',
      'LeadForm','LeadScoringRule','DripSequence','DripEnrollment','Project',
      'ApiKey','OutboundWebhook','AuditLog'
    ])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.current_tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true))
    $p$, t);
  END LOOP;
END $$;

-- Tenant table uses `id` as the tenant key.
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = current_setting('app.current_tenant_id', true))
  WITH CHECK (id = current_setting('app.current_tenant_id', true));

-- ProposalEvent has no tenantId column; it inherits tenancy from its Proposal.
DROP POLICY IF EXISTS tenant_isolation ON "ProposalEvent";
CREATE POLICY tenant_isolation ON "ProposalEvent"
  USING (EXISTS (
    SELECT 1 FROM "Proposal" p
    WHERE p.id = "ProposalEvent"."proposalId"
      AND p."tenantId" = current_setting('app.current_tenant_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Proposal" p
    WHERE p.id = "ProposalEvent"."proposalId"
      AND p."tenantId" = current_setting('app.current_tenant_id', true)
  ));

-- 4. Child tables of CustomTable (CustomColumn, CustomRow) and similar
--    join-only tables inherit isolation via FK cascade and are never queried
--    without a tenant-scoped parent join.

-- 5. Public-portal access path: share-token endpoints must run their lookup
--    outside withTenant() to find the proposal by shareToken (no tenant context
--    yet), then set app.current_tenant_id and resume normal flow. On managed
--    Postgres this means the lookup query needs a WHERE on shareToken that
--    matches a specific token — the surrounding RLS will return 0 rows unless
--    we explicitly bypass for that single read. See src/lib/portal/*.
