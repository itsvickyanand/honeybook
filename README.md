# Avantus — Multi-tenant Client Experience Platform

A reference implementation of a wedding-cluster client-experience SaaS, built end-to-end:

- **Multi-tenant auth** — signup wizard with business-type selection, login, forgot/reset, JWT cookies, role-permission gates
- **Dynamic Item Master** — virtual tables (`CustomTable` + `CustomColumn` + `CustomRow`), 9 column types, CRUD from UI, CSV import with auto-mapping
- **AI proposal engine (5-stage)** — parse → pgvector RAG → Claude compose → constraint check → render. Tenant-tunable tone/upsell/margin/instructions
- **Invoicing** — strict state machine, concurrency-safe numbering (`SELECT … FOR UPDATE`), CGST/SGST/IGST by place-of-supply, PDF rendering via worker
- **Payments** — Razorpay adapter with mock mode, signed webhooks, multi-payment reconciliation, manual entry
- **eSign** — Digio adapter with mock mode + webhook receiver
- **CRM pipeline** — drag-and-drop Kanban, stages, lead scoring, activity timeline
- **Comms** — email (Resend), WhatsApp (Meta Cloud API), SMS (MSG91), in-portal chat — all behind a `comms.send*` facade routed through BullMQ
- **Accounting sync** — Zoho Books (OAuth + push) + Tally desktop-bridge endpoints
- **GST e-invoicing** — IRP adapter with mock mode (gated by tenant turnover threshold)
- **Calendar** — Google Calendar OAuth + bidirectional sync scaffold
- **Files & gallery** — S3 (MinIO in dev) with signed-URL uploads, Sharp image processing, client-portal gallery approval
- **Vertical plugin registry** — per-business-type hooks (`defaultPortalTemplate`, `defaultDocumentPacks`)
- **Analytics dashboard** — revenue (12mo), proposal funnel, receivables aging, AI acceptance rate
- **Team management** — invite/accept flow, role editing, suspend
- **Hardening** — RLS policies, region router abstraction, table partitioning template, production PgBouncer + dual-Redis runbook

---

## Local stack (no Docker)

Prerequisites:
- **Postgres 14+ with pgvector**. Postgres.app ships pgvector built-in — easiest.
  Alternatively: `brew install postgresql@16 pgvector && brew services start postgresql@16`.
- **Redis**: `brew install redis && brew services start redis`.

```bash
# One-time
createdb honeybook
npm install
npm run db:reset        # schema + pgvector extension + RLS + seed

# Daily
npm run dev             # http://localhost:3000
npm run dev:worker      # in another terminal — runs the BullMQ workers
```

Files are written to `./uploads` (gitignored). Flip `STORAGE_DRIVER=s3` in `.env` to use S3 in production.

> Docker workflow (Postgres + Redis + MinIO in containers) is still supported — see `docker-compose.yml` and use the URLs in `.env.example`.

### Demo accounts (password `demo1234` for all)

| Business type        | Login email                        |
| -------------------- | ---------------------------------- |
| Catering & Banquet   | `owner@catering.demo`              |
| Event Management     | `owner@event-management.demo`      |
| Wedding Photography  | `owner@wedding-photography.demo`   |
| Wedding Planner      | `owner@wedding-planner.demo`       |
| Florist & Decor      | `owner@florist-decor.demo`         |

### Service URLs (dev)

| Service | URL |
| --- | --- |
| App | http://localhost:3000 |
| MinIO console | http://localhost:9001 (login: `honeybook` / `honeybook123`) |
| Postgres | `postgresql://honeybook:honeybook@localhost:5433/honeybook` |
| Redis | `redis://localhost:6380` |

---

## Architecture map

```
src/
  app/
    (auth)/            login, signup, forgot, reset, invite/[token]
    app/               authenticated dashboard
      overview         home with KPIs + recent proposals
      leads/           Kanban pipeline
      catalog/         dynamic Item Master
      contacts/        clients
      proposals/       proposal editor + new-proposal wizard
      invoices/        invoice list + detail
      analytics/       Recharts dashboard
      settings/        tenant info, roles, team
        ai/            tone, upsell, mandatory/blacklisted items, custom instructions
    p/[token]/         PUBLIC client portal — animated, edit-mode, pay+sign, chat
    api/
      auth/            login, signup, logout, forgot, reset
      tables/          custom-table CRUD + CSV import
      columns/[id]
      rows/[id]
      contacts/
      leads/           pipeline + drag-to-stage
      proposals/       create (5-stage AI), edit, convert-to-invoice
      invoices/        create, transition (DRAFT → SENT etc.)
      payments/manual  vendor records cash/cheque payment
      files/           sign-upload, upload-direct, confirm
      galleries/       create + per-item approve (public)
      documents/
      calendar/        events, google connect/callback
      accounting/      zoho connect/callback, sync trigger, tally bridge
      ai-config/       tenant AI tuning
      team/invites/    invite flow
      team/users/[id]  role edit, suspend
      invite/[token]/accept
      chat/threads/[id]/messages
      share/[token]/   PUBLIC: get, changes, accept, pay, sign, chat
      webhooks/
        razorpay
        digio
        whatsapp
  components/          UI primitives + dashboard shell
  lib/
    db.ts              prisma singleton
    db-rls.ts          withTenant(tenantId, …) helper for RLS path
    auth.ts            JWT + bcrypt
    session.ts         requireContext + permission checker
    api.ts             requireApi + rate limit + apiHandler wrapper
    rate-limit.ts      Redis token-bucket
    redis.ts           two clients (generic + bullmq-specific)
    queue.ts           BullMQ queue defs + JOB_NAMES + enqueue()
    logger.ts          pino
    sentry.ts          captureException (no-op without DSN)
    storage.ts         S3 + local-disk adapter
    provision.ts       tenant + roles + tables on signup
    invoice.ts         state machine + computeInvoiceTotals + allocateInvoiceNumber
    financial-year.ts  Indian FY helpers
    proposal-schema.ts ProposalDoc Zod + totals
    region.ts          prismaForTenant(id) — single-region today, MENA-ready
    ai/
      types.ts         parsedBriefSchema, ConstraintIssue
      stage-a-parse.ts brief → structured (Claude + heuristic fallback)
      stage-b-retrieve pgvector RAG (fallback: text overlap)
      stage-c-compose  Claude compose (fallback: bucket retrieved rows)
      stage-d-validate constraint check + auto-fix
      pipeline.ts      runProposalPipeline() — the 5-stage orchestrator
    embeddings.ts      Voyage / OpenAI / deterministic-hash fallback
    payments/razorpay  create-link + verify-webhook
    esign/digio        create-sign + verify-webhook
    accounting/zoho    OAuth + push
    gst.ts             IRP adapter (mock + real-aggregator hookup point)
    plugins/
      registry.ts      registerPlugin + getPlugin
      travel.ts        visa pack hook
      photography.ts   gallery section hook
    portal/types.ts    PortalTemplateData + defaultTemplate()
    comms/
      index.ts         sendEmail / sendSms / sendWhatsApp facades
      templates.ts     transactional templates
    pdf/
      invoice-template.ts
      proposal-template.ts
  worker/
    index.ts           BullMQ worker process (separate from API)
    handlers/
      email.ts         Resend
      sms.ts           MSG91
      whatsapp.ts      Meta Cloud API
      pdf.ts           render proposal/invoice
      embeddings.ts    build per-row + reindex-tenant
      accounting.ts    push to provider
      gst.ts           IRN generation
      payments.ts      reconcile against invoice
      notification.ts  fan-out (in-app + email/sms/whatsapp)
      webhook.ts       outbound webhook deliveries

prisma/
  schema.prisma            29 models, Postgres + Json
  business-templates.ts    5 vertical templates
  seed.ts                  5 demo tenants + pipelines + roles + AI config
  init.sql                 extensions (vector, pg_trgm, citext)
  post-push.sql            embedding column, HNSW, partition indexes
  rls.sql                  Postgres RLS policies + honeybook_app role
  partitioning.sql         partition template (run manually)
docker-compose.yml         dev infra
docker-compose.prod.yml    production reference
RUNBOOK.md                 production deploy + incident response
```

---

## How the AI pipeline runs

When a salesperson submits a brief at `/app/proposals/new`:

1. **Stage A — parse**: `parseBrief()` extracts `guestCount, budget, dietary, occasion, city, …` via Claude (or a deterministic regex fallback). Stored on `Proposal.parsedBrief`.
2. **Stage B — retrieve**: `retrieveCatalog()` embeds the query, runs `embedding <=> $query::vector` against `CustomRow.embedding` (pgvector HNSW), takes top-K per table. If no embeddings yet, falls back to text-overlap scoring.
3. **Stage C — compose**: `composeProposal()` calls Claude with the retrieved rows + tenant AI config (tone, upsell, custom instructions). Claude can only use the curated rows — it can't invent items.
4. **Stage D — validate**: `validateAndFix()` runs deterministic checks (zero-price items, blacklist, budget ceiling, margin floor) and returns `issues[]`.
5. **Stage E — render**: the client portal at `/p/[token]` reads the `contentJson` and animates it. Edit mode lets the client +/- quantities; their version is saved as a new `ProposalVersion` and re-validated via Stage D.

Embeddings are built asynchronously by the `embeddings.row.build` worker job. When a row is created or updated, `embeddingDirty=true` triggers a queued job; the worker writes the vector via raw SQL (Prisma has no pgvector type yet).

Without `ANTHROPIC_API_KEY`, every stage has a deterministic fallback so the pipeline always runs.

---

## Permissions

| Permission          | What it gates                              |
| ------------------- | ------------------------------------------ |
| `*`                 | Everything (Owner)                         |
| `catalog.view`      | Read item master                           |
| `catalog.edit`      | CRUD rows                                  |
| `schema.edit`       | Create/edit/delete tables and columns      |
| `proposal.view`     | View proposals + invoices                  |
| `proposal.create`   | Generate proposals via AI; create invoices |
| `proposal.send`     | Mark sent; transition invoice states       |
| `contact.view`      | Read clients + leads                       |
| `contact.edit`      | Add/update clients; move leads             |
| `team.manage`       | Invite + edit + suspend users              |
| `settings.manage`   | Access /app/settings + AI config + integrations |

Resolved via `parsePermissions()` (handles wildcards: `catalog.*` matches `catalog.edit`).

---

## Production

See `RUNBOOK.md` for the full deploy + incident playbook. Quick highlights:

- App connects via PgBouncer (port 6432) using the `honeybook_app` role (subject to RLS).
- Two Redis instances: cache + queue. The cache uses `allkeys-lru`; the queue persists to disk.
- API and worker are separate processes (so PDF/Sharp/AI work doesn't starve requests).
- `prisma/rls.sql` MUST be applied before any production traffic. RLS is the backstop behind Prisma's application-layer tenant scoping.
- `prismaForTenant(tenantId)` is the right API for any production-region-safe path — single region today; MENA activates by setting `DATABASE_URL_MENA`.

---

## What still isn't fully wired (honest list)

- **PDF rendering** uses HTML output stored in S3 — production should swap in puppeteer-core + @sparticuz/chromium-min.
- **WhatsApp inbound** webhook only matches phone → existing contact; new-lead auto-create is TODO.
- **Tally bridge** has server-side endpoints + protocol; the Electron desktop agent is out of scope.
- **GST IRN** has a mock provider + adapter contract; pick an aggregator (ClearTax, Masters India) to wire production.
- **Socket.io in-portal chat** is HTTP+polling for now — same data model; swap transport when needed.
- **Partitioning** SQL is templated; run via pg_partman when traffic justifies.

Everything else is wired and the production build is clean. Restart your dev server after pulling — Prisma client is regenerated by `npm run db:push`.
