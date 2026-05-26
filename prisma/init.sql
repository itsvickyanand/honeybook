-- Initial Postgres setup: enable extensions used by the platform.
-- pgvector  — vector similarity search for catalog RAG
-- pg_trgm   — trigram indexes for fuzzy search
-- citext    — case-insensitive text type
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
