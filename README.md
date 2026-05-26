# Avantus — Multi-tenant Client Experience Platform

A reference implementation of a multi-tenant SaaS for service businesses, built end-to-end:

- **Tenants** are businesses (catering, event mgmt, photography, planner, florist).
- Each tenant has **roles** (Owner / Sales / Coordinator / Viewer) and **users** scoped to those roles.
- Every tenant gets a pre-built, fully editable **Item Master** (custom tables + columns + rows, with CSV upload).
- An **AI proposal engine** reads the tenant's catalog as ground truth and drafts a curated proposal.
- Salespeople edit the proposal inline; the **client gets a share-link portal** where they can change quantities and request edits in real time.
- All styling is **Tailwind v4** + custom animations via **Framer Motion**.

> Built as a single coherent codebase by a senior engineer in one sitting — Next.js 16 (App Router), TypeScript, Prisma + SQLite (Postgres-ready), Claude API.

---

## Quick start

```bash
npm install
npx prisma db push       # creates dev.db from prisma/schema.prisma
npm run db:seed          # seeds 5 business types + 5 demo tenants
npm run dev              # http://localhost:3000
```

### Demo accounts (password `demo1234` for all)

| Business type        | Login email                            |
| -------------------- | -------------------------------------- |
| Catering & Banquet   | `owner@catering.demo`                  |
| Event Management     | `owner@event-management.demo`          |
| Wedding Photography  | `owner@wedding-photography.demo`       |
| Wedding Planner      | `owner@wedding-planner.demo`           |
| Florist & Decor      | `owner@florist-decor.demo`             |

Or click **"Get started"** and create your own tenant in the 3-step signup wizard.

### Enable Claude (optional)

The app ships a deterministic local proposal generator so it works without an API key. To get real Claude-curated proposals, add to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Then restart the dev server. The proposal engine uses **Claude Sonnet 4.5** by default — change `MODEL` in `src/lib/ai.ts` to switch.

---

## What's inside

### 1. Auth & multi-tenancy
- Signup with business-type wizard (`/signup`) → provisions tenant + 4 roles + pre-built tables + sample rows in one transaction (`src/lib/provision.ts`)
- Login / forgot / reset password with 30-min token
- JWT session cookie via `jose` (`src/lib/auth.ts`)
- Proxy-level auth gate on `/app/*` (`src/proxy.ts`)
- Role-permission system with wildcard matching (`*`, `catalog.*`, etc.) in `src/lib/session.ts`

### 2. Dynamic Item Master
The killer architectural choice: **no actual DDL**. Tenants create virtual tables stored as `CustomTable` + `CustomColumn` records, with rows as `CustomRow.data` JSON. This means:
- ✅ Adding/removing columns is instant, multi-tenant safe, migration-free
- ✅ Each tenant has totally different schemas
- ✅ AI gets clean structured catalog context

Supports 9 column types (`TEXT`, `LONG_TEXT`, `NUMBER`, `CURRENCY`, `DATE`, `BOOLEAN`, `SELECT`, `MULTI_SELECT`, `IMAGE_URL`).

CSV import with auto column-mapping is at `src/app/api/tables/[id]/import/route.ts`.

### 3. AI Proposal engine (`src/lib/ai.ts`)
- Loads the tenant's catalog (up to 50 rows per table) and formats it as structured context.
- Sends to Claude with a strict JSON output schema (validated with Zod).
- Returns a structured `ProposalDoc` with sections, line items (each linked back to its source catalog row), inclusions, terms.
- Saves a versioned snapshot in `ProposalVersion` for every edit.
- Falls back to a deterministic generator if no API key — still useful for demos.

### 4. Client portal (`/p/[token]`)
Public, share-link-based, no login required. Features:
- Animated reveal with Framer Motion
- **"Request changes" edit mode**: client can +/- quantities, remove items, send the modified version back with a note. Vendor sees it as a new version.
- Accept / Decline with optional message
- Records `VIEWED`, `EDITED`, `CHANGE_REQUESTED`, `ACCEPTED`, `DECLINED` events
- Brand color flows from the tenant's business type

### 5. UI & animations
- Tailwind v4 + custom design tokens (`src/app/globals.css`)
- Custom UI primitives (Button, Input, Select, Modal) — no shadcn-cli dependency
- Framer Motion: page transitions, list animations, layout animations, modal portals
- Aurora gradient backgrounds, hover lift, animated active-nav indicator

---

## Architecture at a glance

```
src/
  app/
    (auth)/             # login, signup wizard, forgot, reset
    app/                # authenticated dashboard (proxy-gated)
      catalog/[id]/     # dynamic table editor
      proposals/[id]/   # vendor proposal editor
      contacts/         # CRM
      settings/         # roles + team
    p/[token]/          # PUBLIC client portal
    api/
      auth/             # signup, login, logout, forgot, reset
      tables/           # custom table CRUD
      tables/[id]/columns
      tables/[id]/rows
      tables/[id]/import   # CSV
      columns/[id]      # column patch/delete
      rows/[id]         # row patch/delete
      proposals/        # create proposal (triggers AI)
      proposals/[id]    # edit, save versioned snapshot
      share/[token]/    # PUBLIC: get, send changes, accept/decline
      contacts/
  components/
    ui/                 # Button, Input, Modal, Card
    dashboard/          # Sidebar, PageTransition
    proposal/           # PricingSummary
  lib/
    db.ts               # Prisma singleton
    auth.ts             # JWT + bcrypt
    session.ts          # session loader + permission checker
    api.ts              # API route guard (requireApi)
    provision.ts        # tenant + role + table provisioning
    ai.ts               # Claude proposal generator
    proposal-schema.ts  # Zod schema + totals math
    utils.ts            # cn, slugify, formatCurrency, timeAgo

prisma/
  schema.prisma         # 13 models, multi-tenant, Postgres-ready
  business-templates.ts # 5 vertical templates (tables + columns + sample rows)
  seed.ts               # creates business types + demo tenants
```

### Data model highlights

- `Tenant` is the multi-tenant root. Everything cascade-deletes from it.
- `Role.permissions` is a JSON array of permission strings; `*` is full access.
- `CustomTable → CustomColumn → CustomRow` is the virtual schema engine. `CustomRow.data` is JSON keyed by `CustomColumn.slug`.
- `Proposal.contentJson` is the canonical `ProposalDoc` (a validated structure of sections + line items + terms). Every change snapshots a `ProposalVersion`.
- `ProposalEvent` logs every interaction for activity feeds.
- `Proposal.shareToken` powers the public `/p/[token]` portal — no separate access table needed.

### Why SQLite for dev
Prisma + SQLite means zero local setup. The schema uses `String` for JSON payloads, which is a no-op switch to `Json` (Postgres native) for production. To move to Postgres:
1. Change `provider = "postgresql"` in `prisma/schema.prisma`
2. Change `String` → `Json` on `permissions`, `templateJson`, `optionsJson`, `data`, `contentJson`, `payload`
3. Set `DATABASE_URL=postgres://…`
4. `npx prisma migrate dev`

### Permissions reference

| Permission          | What it gates                                   |
| ------------------- | ----------------------------------------------- |
| `*`                 | Everything (Owner)                              |
| `catalog.view`      | Read item master                                |
| `catalog.edit`      | CRUD rows                                       |
| `schema.edit`       | Create/edit/delete tables and columns           |
| `proposal.view`     | View proposals                                  |
| `proposal.create`   | Generate proposals via AI                       |
| `proposal.send`     | Mark as sent / share with client                |
| `contact.view`      | Read clients                                    |
| `contact.edit`      | Add/update clients                              |
| `team.manage`       | (Reserved for future) invite users, edit roles  |
| `settings.manage`   | Access /app/settings                            |

---

## Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run db:push      # apply schema to dev.db
npm run db:seed      # seed business types + demo tenants
npm run db:reset     # wipe + re-seed (destructive)
npm run db:studio    # Prisma Studio
```

---

## What this isn't

- There's no email sending — the password-reset endpoint returns the reset URL in the JSON response so you can click it in the demo. In production, swap in Resend / SES inside `src/app/api/auth/forgot/route.ts`.
- There's no payment processing (Razorpay / Stripe wiring is one route handler away).
- There's no PDF export for proposals.
- The settings page is read-only; team-invite + role-edit mutations are the obvious follow-up.

Everything else — multi-tenant auth, dynamic schemas, CSV import, AI generation, versioned proposals, public share portal with edit mode — is fully wired.
