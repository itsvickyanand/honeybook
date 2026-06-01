# Honeybook — Multi-tenant Client Experience Platform

A reference implementation of a wedding-cluster client-experience SaaS, built end-to-end.
**58 Prisma models · ~125 API routes · separate API + BullMQ worker processes · India-first (GST/INR) with MENA-ready region routing.**

### Core platform
- **Multi-tenant auth** — signup wizard with business-type selection, login, forgot/reset, JWT cookies, role-permission gates, **2FA (TOTP/`speakeasy`)** and OTP challenges
- **Platform admin console** (`/admin`) — cross-tenant operator view, tenant management, integration oversight, platform audit log
- **Dynamic Item Master** — virtual tables (`CustomTable` + `CustomColumn` + `CustomRow`), 9 column types, CRUD from UI, CSV import with auto-mapping
- **AI proposal engine (5-stage)** — parse → pgvector RAG → Claude compose → constraint check → render. Tenant-tunable tone/upsell/margin/instructions
- **Projects / workspace** — project lifecycle, configurable project stages, project members + external **collaborator portals**, payment schedules
- **Tasks** — assignable tasks, "My Work" view, per-task permissions, task fan-out to collaborators
- **CRM pipeline** — drag-and-drop Kanban, stages, **lead scoring rules**, activity timeline, public **lead-capture forms** (`/f/[slug]`)
- **Contracts & eSign** — contract templates, render pipeline, Digio adapter with mock mode + webhook receiver
- **Invoicing** — strict state machine, concurrency-safe numbering (`SELECT … FOR UPDATE`), CGST/SGST/IGST by place-of-supply, **real PDF rendering via Puppeteer worker**, public pay page (`/i/[token]`)
- **Payments** — Razorpay adapter with mock mode, signed webhooks, multi-payment reconciliation, manual entry, **payment schedules + mandates (auto-pay)**
- **Reviews** — review request flow + public review-collection page (`/r/[token]`)

### Integrations & comms
- **Comms** — email (Resend), WhatsApp (Meta Cloud API), SMS (MSG91), in-portal chat — all behind a `comms.send*` facade routed through BullMQ
- **Drip campaigns** — drip sequences + enrollments, processed by a dedicated worker
- **Accounting sync** — Zoho Books (OAuth + push) + Tally desktop-bridge endpoints
- **GST e-invoicing** — IRP adapter with mock mode (gated by tenant turnover threshold)
- **Calendar** — Google Calendar OAuth + bidirectional sync scaffold
- **Files & gallery** — S3 (MinIO in dev) with signed-URL uploads, Sharp image processing, client-portal gallery approval
- **Integrations registry** — per-tenant integration records with encrypted credentials (`integrations/crypto.ts`)
- **Outbound webhooks + API keys** — programmable webhooks (`OutboundWebhook`) and tenant API keys for external automation

### Customization, ops & hardening
- **Vertical plugin registry** — per-business-type hooks (`defaultPortalTemplate`, `defaultDocumentPacks`)
- **i18n** — `en` / `hi` / `ar` message catalogs (RTL-aware)
- **Analytics & reports** — revenue (12mo), proposal funnel, receivables aging, AI acceptance rate
- **Notifications** — in-app feed + multi-channel fan-out
- **Team management** — invite/accept flow, role editing, suspend; multi-team membership
- **Audit logging** — tenant-level `AuditLog` + platform-level `PlatformAuditLog`
- **Cron jobs** — scheduled queue maintenance, overdue-invoice sweeps, drip processing (`cron-auth`-guarded endpoints)
- **Hardening** — RLS policies, region router abstraction, table partitioning template, production PgBouncer + dual-Redis runbook

---

## Local stack (Docker)

Prerequisites: Docker (Postgres + pgvector, Redis, MinIO) — see `docker-compose.yml`. The `.env.example` defaults point at the Docker ports below.

```bash
# One-time
cp .env.example .env
docker compose up -d     # Postgres :5433 · Redis :6380 · MinIO :9000/:9001
npm install
npm run db:reset         # schema + extensions + RLS + seed

# Daily
npm run dev              # http://localhost:3000
npm run dev:worker       # in another terminal — runs the BullMQ workers
```

> **No-Docker alternative:** Postgres 14+ with pgvector (Postgres.app ships it built-in, or `brew install postgresql@16 pgvector`) + `brew install redis`. Point `DATABASE_URL` / `REDIS_URL` at your local instances and set `STORAGE_DRIVER=local` to write files to `./uploads` (gitignored).

### Demo accounts (password `demo1234` for all)

| Business type        | Login email                        |
| -------------------- | ---------------------------------- |
| Catering & Banquet   | `owner@catering.demo`              |
| Event Management     | `owner@event-management.demo`      |
| Wedding Photography  | `owner@wedding-photography.demo`   |
| Wedding Planner      | `owner@wedding-planner.demo`       |
| Florist & Decor      | `owner@florist-decor.demo`         |

Platform admin: `admin@honeybook.platform` / `admin123!` (override via `SEED_PLATFORM_ADMIN_PASSWORD`) at `/admin/login`.

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
    app/               authenticated dashboard (tenant staff)
      page.tsx         overview — KPIs + recent activity
      leads/           Kanban pipeline
      forms/           public lead-form builder
      catalog/         dynamic Item Master
      contacts/        clients
      proposals/       proposal editor + new-proposal wizard
      projects/        project workspace, stages, members
      tasks/  my-work/ task board + personal queue
      invoices/        invoice list + detail
      finance/         payments, schedules, mandates
      documents/       contracts + document packs
      galleries/       gallery management + approval
      reviews/         review requests
      calendar/        Google-synced calendar
      inbox/           in-portal chat threads
      notifications/   in-app feed
      analytics/       Recharts dashboard
      team/            invites, roles, members
      settings/        tenant info, integrations, AI config
      setup/           onboarding wizard
    admin/             PLATFORM operator console (cross-tenant)
    p/[token]/         PUBLIC client portal — animated, edit-mode, pay+sign, chat
    c/[token]/         PUBLIC collaborator portal — scoped tasks + shared files only
    i/[token]/         PUBLIC invoice — view + pay
    r/[token]/         PUBLIC review-collection page
    f/[slug]/          PUBLIC lead-capture form
    api/               ~125 route handlers (see below)
  components/          UI primitives + dashboard shell (ui/, dashboard/, proposal/, tasks/)
  lib/
    db.ts              prisma singleton
    db-rls.ts          withTenant(tenantId, …) helper for the RLS path
    region.ts          prismaForTenant(id) — single-region today, MENA-ready
    auth.ts            JWT + bcrypt
    platform-auth.ts   platform-admin session
    session.ts         requireContext + permission checker
    api.ts             requireApi + rate limit + apiHandler wrapper
    cron-auth.ts       shared-secret guard for /api/cron/*
    rate-limit.ts      Redis token-bucket
    redis.ts           two clients (generic + bullmq-specific)
    queue.ts           BullMQ queue defs + JOB_NAMES + enqueue()
    queue-scheduler.ts repeatable/cron job registration
    logger.ts  sentry.ts  audit.ts  money.ts  host.ts  utils.ts
    storage.ts         S3 + local-disk adapter
    provision.ts       tenant + roles + tables on signup
    feature-flags.ts   per-tenant feature gating
    invoice.ts         state machine + computeInvoiceTotals + allocateInvoiceNumber
    financial-year.ts  Indian FY helpers
    money.ts           currency math
    proposal-schema.ts ProposalDoc Zod + totals
    lead-scoring.ts    rule evaluation
    lifecycle.ts       project/lead lifecycle transitions
    project-stages.ts  stage config + transitions
    participants.ts    project/collaborator membership resolution
    contracts.ts  contracts-render.ts   contract templates + HTML render
    ai/
      types.ts         parsedBriefSchema, ConstraintIssue
      stage-a-parse    brief → structured (Claude + heuristic fallback)
      stage-b-retrieve pgvector RAG (fallback: text overlap)
      stage-c-compose  Claude compose (fallback: bucket retrieved rows)
      stage-d-validate constraint check + auto-fix
      pipeline.ts      runProposalPipeline() — the 5-stage orchestrator
    embeddings.ts      Voyage / OpenAI / deterministic-hash fallback
    payments/razorpay  create-link + verify-webhook
    esign/digio        create-sign + verify-webhook
    accounting/zoho    OAuth + push
    gst.ts             IRP adapter (mock + real-aggregator hookup point)
    integrations/      registry + resolve + crypto (encrypted creds)
    plugins/           registry + travel (visa pack) + photography (gallery) hooks
    portal/types.ts    PortalTemplateData + defaultTemplate()
    comms/             sendEmail / sendSms / sendWhatsApp facades + templates
    calendar/          Google OAuth + sync
    i18n/              en / hi / ar message catalogs
    pdf/
      render.ts        htmlToPdf() — Puppeteer (chromium)
      invoice-template.ts  proposal-template.ts
  worker/
    index.ts           BullMQ worker process (separate from API)
    handlers/
      email.ts         Resend
      sms.ts           MSG91
      whatsapp.ts      Meta Cloud API
      pdf.ts           render proposal/invoice → PDF via Puppeteer
      embeddings.ts    build per-row + reindex-tenant
      accounting.ts    push to provider
      gst.ts           IRN generation
      payments.ts      reconcile against invoice
      drip.ts          advance drip enrollments
      overdue.ts       overdue-invoice sweep + reminders
      notification.ts  fan-out (in-app + email/sms/whatsapp)
      webhook.ts       outbound webhook deliveries

prisma/
  schema.prisma            58 models, Postgres + Json + pgvector
  business-templates.ts    5 vertical templates
  seed.ts                  5 demo tenants + pipelines + roles + AI config + platform admin
  init.sql                 extensions (vector, pg_trgm, citext)
  post-push.sql            embedding column, HNSW, partition indexes
  rls.sql                  Postgres RLS policies + honeybook_app role
  partitioning.sql         partition template (run manually)
docker-compose.yml         dev infra (Postgres + Redis + MinIO)
docker-compose.prod.yml    production reference
RUNBOOK.md                 production deploy + incident response
```

### API surface (selected route groups under `src/app/api/`)

```
auth  2fa  invite  roles  team  teams                 — identity & access
tables  columns  rows                                  — dynamic Item Master
contacts  leads  lead-scoring  forms                   — CRM
proposals  ai-config                                   — AI proposals
projects  tasks  workspace  portal-template            — delivery
invoices  payments  payment-schedules  mandates        — billing
contracts  documents  reviews  galleries  files        — documents & assets
calendar  oauth  accounting  integrations              — integrations
messages  chat  notifications  drips                   — comms
search  reports  admin                                 — ops & platform
share  c  i  mock-pay  mock-sign                        — PUBLIC token endpoints
webhooks (razorpay/digio/whatsapp)  webhooks-out       — inbound + outbound webhooks
api-keys  cron                                         — automation
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

Permissions are stored per role and resolved via `parsePermissions()`, which handles wildcards (`catalog.*` matches `catalog.edit`; `*` grants everything to Owner).

| Domain        | Permissions                                             |
| ------------- | ------------------------------------------------------- |
| Catalog/schema | `catalog.view` · `catalog.edit` · `schema.edit`        |
| Proposals     | `proposal.view` · `proposal.create` · `proposal.send`   |
| Contacts/CRM  | `contact.view` · `contact.edit`                         |
| Projects/tasks | `project.manage` · `project.assign` · `task.view` · `task.edit` · `task.assign` · `task.complete` |
| Billing       | `billing.view` · `billing.manage`                       |
| Team/roles    | `team.view` · `team.manage` · `member.invite` · `member.manage` · `role.manage` |
| Settings      | `settings.manage` · `integrations.manage`               |

Default roles seeded per tenant: **Owner, Admin, Manager, Sales, Coordinator, Viewer**.

---

## Production

See `RUNBOOK.md` for the full deploy + incident playbook. Reference stack: **Vercel (app) + Neon (Postgres) + Render (worker) + Redis Cloud + Cloudflare R2**. Quick highlights:

- App connects via a pooled connection (PgBouncer / Neon pooler) using the `honeybook_app` role (subject to RLS); migrations use the direct URL (`DIRECT_URL`).
- Redis backs both cache and the BullMQ queue (cache `allkeys-lru`; queue persists to disk).
- API and worker are separate processes (so PDF/Sharp/AI work doesn't starve requests).
- `prisma/rls.sql` MUST be applied before any production traffic. RLS is the backstop behind Prisma's application-layer tenant scoping.
- `prismaForTenant(tenantId)` is the right API for any production-region-safe path — single region today; MENA activates by setting the regional database URL.

---

## What still isn't fully wired (honest list)

- **WhatsApp inbound** webhook only matches phone → existing contact; new-lead auto-create is TODO.
- **Tally bridge** has server-side endpoints + protocol; the Electron desktop agent is out of scope.
- **GST IRN** has a mock provider + adapter contract; pick an aggregator (ClearTax, Masters India) to wire production.
- **In-portal chat** is HTTP + polling for now — same data model; swap in a realtime transport (Socket.io/SSE) when needed.
- **Calendar sync** is OAuth + one-direction scaffold; full bidirectional reconciliation is stubbed.
- **Partitioning** SQL is templated; run via pg_partman when traffic justifies.

Everything else is wired and the production build is clean. Restart your dev server after pulling — the Prisma client is regenerated by `npm run db:push`.
