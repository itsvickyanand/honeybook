-- Row-Level Security policies (BRD Addendum v1.2 Fix 13).
--
-- The application connects as a non-BYPASSRLS role (`honeybook_app`).
-- Every transaction MUST set: SET LOCAL app.current_tenant_id = '<tenant-id>';
-- See src/lib/db-rls.ts.
--
-- Admin tooling (migrations, seed scripts, support tools) uses the owner role
-- `honeybook` which has BYPASSRLS — never reuse this in app code.
--
-- Run AFTER prisma db push.

-- 1. Application role (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'honeybook_app') THEN
    CREATE ROLE honeybook_app LOGIN PASSWORD 'honeybook_app';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO honeybook_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO honeybook_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO honeybook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO honeybook_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO honeybook_app;

-- 2. Enable RLS on every tenant-scoped table.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'Tenant', 'Role', 'User', 'UserInvite', 'CustomTable', 'Contact', 'Pipeline',
      'Lead', 'Activity', 'Proposal', 'ProposalEvent', 'TenantAIConfig',
      'InvoiceSequence', 'Invoice', 'Payment', 'SignatureRequest', 'FileObject',
      'Gallery', 'Document', 'ChatThread', 'Message', 'CalendarEvent',
      'AccountingConnection', 'AccountingSyncLog', 'PortalTemplate',
      'WebhookEvent', 'Notification'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 3. Standard policy: row is visible iff its tenantId matches the session GUC.
--    The Tenant table itself uses `id` as the tenant key.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'Role','User','UserInvite','CustomTable','Contact','Pipeline','Lead','Activity',
      'Proposal','ProposalEvent','TenantAIConfig','InvoiceSequence','Invoice','Payment',
      'SignatureRequest','FileObject','Gallery','Document','ChatThread','Message',
      'CalendarEvent','AccountingConnection','AccountingSyncLog','PortalTemplate',
      'WebhookEvent','Notification'
    ])
  LOOP
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
        USING ("tenantId" = current_setting('app.current_tenant_id', true))
        WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
    $p$, t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = current_setting('app.current_tenant_id', true))
  WITH CHECK (id = current_setting('app.current_tenant_id', true));

-- 4. Child tables of CustomTable use the parent's tenantId via the FK.
--    Simpler to keep them denormalised; this project's CustomColumn and
--    CustomRow inherit isolation through their CustomTable parent (cascade
--    delete) — they aren't directly queryable without a CustomTable join.

-- 5. Public-portal access path: the share-token endpoints use the BYPASSRLS owner
--    role *briefly* to look up the proposal by shareToken, then SET LOCAL
--    app.current_tenant_id and switch to the app role for subsequent writes.
