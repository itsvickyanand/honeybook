-- Partitioning + retention (BRD Addendum v1.2 Fix 15).
--
-- This file ALTERs the high-volume tables to use Postgres declarative range
-- partitioning by createdAt. Run AFTER prisma db push but BEFORE significant
-- data lands; it's a destructive operation.
--
-- Tables partitioned (monthly):
--   ProposalEvent       — 24 months retention, then archive
--   WebhookEvent        — 90 days hot, then drop
--   Notification        — 6 months hot, then drop
--   AccountingSyncLog   — 24 months hot, then archive
--   Message             — 18 months hot, then archive
--
-- The archive process is owned by a separate job (cron) that exports older
-- partitions to S3 in Parquet then DETACH/DROPs them.
--
-- This SQL is illustrative; in practice we run it via pg_partman to automate
-- partition creation. See: https://github.com/pgpartman/pg_partman
--
-- ⚠ DO NOT RUN AGAINST AN EXISTING TABLE WITH DATA without backing it up.
--   Partitioning conversion requires recreating the table.

-- Example: ProposalEvent
-- Step 1: rename existing → backup
-- ALTER TABLE "ProposalEvent" RENAME TO "ProposalEvent__old";

-- Step 2: recreate as partitioned by createdAt
-- CREATE TABLE "ProposalEvent" (
--   id text PRIMARY KEY,
--   "proposalId" text NOT NULL,
--   type text NOT NULL,
--   payload jsonb,
--   actor text NOT NULL,
--   "createdAt" timestamptz NOT NULL DEFAULT now()
-- ) PARTITION BY RANGE ("createdAt");

-- Step 3: create monthly partitions for the next 18 months
-- DO $$
-- DECLARE
--   m date := date_trunc('month', now())::date;
-- BEGIN
--   FOR i IN 0..17 LOOP
--     EXECUTE format(
--       'CREATE TABLE IF NOT EXISTS %I PARTITION OF "ProposalEvent" FOR VALUES FROM (%L) TO (%L)',
--       'ProposalEvent_' || to_char(m, 'YYYY_MM'),
--       m,
--       (m + interval '1 month')::date
--     );
--     m := (m + interval '1 month')::date;
--   END LOOP;
-- END $$;

-- Step 4: copy data
-- INSERT INTO "ProposalEvent" SELECT * FROM "ProposalEvent__old";

-- Step 5: drop the backup
-- DROP TABLE "ProposalEvent__old";

-- Repeat for the other tables. In production, automate with pg_partman.

-- Retention archive job pseudocode (run nightly via worker):
--   for each partitioned table:
--     for each partition older than retention:
--       COPY partition TO 's3://archive/<table>/<partition>.parquet'
--       ALTER TABLE detach + DROP partition
