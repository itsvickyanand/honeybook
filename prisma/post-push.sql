-- Post-push migration: extensions + pgvector embedding column + indexes.
-- Run after `prisma db push` (re-run safe).
--
-- Extensions are re-created here because `prisma db push --force-reset`
-- drops the public schema and with it any extensions.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

--
-- The embedding dimension must match TenantAIConfig.embeddingDim.
-- We default to 1024 (Voyage-3). Switch to 1536 (OpenAI 3-small) by:
--   ALTER TABLE "CustomRow" DROP COLUMN IF EXISTS embedding;
--   ALTER TABLE "CustomRow" ADD COLUMN embedding vector(1536);
--   (then re-embed everything)

ALTER TABLE "CustomRow" ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW index for fast ANN search.
-- ef_construction=64, m=16 is a sane default; tune later.
CREATE INDEX IF NOT EXISTS customrow_embedding_idx
  ON "CustomRow"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Helpful indexes for hot queries
CREATE INDEX IF NOT EXISTS proposalevent_created_idx ON "ProposalEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS webhookevent_created_idx ON "WebhookEvent" ("createdAt");
CREATE INDEX IF NOT EXISTS notification_created_idx ON "Notification" ("createdAt");
CREATE INDEX IF NOT EXISTS accountingsynclog_created_idx ON "AccountingSyncLog" ("createdAt");
CREATE INDEX IF NOT EXISTS message_created_idx ON "Message" ("createdAt");

-- Trigram indexes for fuzzy contact/lead search
CREATE INDEX IF NOT EXISTS contact_fullname_trgm ON "Contact" USING gin ("fullName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS lead_title_trgm ON "Lead" USING gin ("title" gin_trgm_ops);
