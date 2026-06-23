# Avantus — Modules, Gaps & Production-Readiness Plan

> Living checkpoint document. Update as work happens.
> If a session loses context, this is the source of truth for "where are we and what's next."

**Production URL:** https://honeybook-virid.vercel.app
**Last reviewed:** 2026-06-04

---

## Status legend

- ✅ Working in prod
- 🟡 Working but rough / not production-grade
- 🔴 Broken or missing
- ⬜ Planned / not started
- ❓ Decision needed from user

---

## Module map

```
┌─────────────────────────────────────────────────────────────────┐
│  M0. Platform — infra, observability, security cross-cuts       │
├─────────────────────────────────────────────────────────────────┤
│  M1. Auth & RBAC         (login, signup, sessions, permissions) │
│  M2. Tenant Onboarding   (wizard, catalog, members, brand)      │
│  M3. Lead Management     (forms, scoring, pipeline, drips, AI)  │
│  M4. Proposals & Money   (AI gen, builder, eSign, invoice, pay) │
│  M5. Project Delivery    (workspace, tasks, files, calendar)    │
│  M6. Client Portal       (/p/[token], /f/[slug], /book/[slug])  │
│  M7. Integrations        (BYO credentials, OAuth, providers)    │
└─────────────────────────────────────────────────────────────────┘
```

---

## M0. Platform layer (cross-cutting)

**Scope:** Hosting, DB, queue, storage, observability, secrets, error handling, performance.

### Working ✅
- Vercel Fluid Compute prod deploy with cron schedules
- Neon Postgres pooled + direct URLs, RLS via `prisma/post-push.sql`
- Redis Cloud + BullMQ worker on Render (degrades gracefully when missing)
- Cloudflare R2 storage with presigned URLs, tenant-prefixed keys
- Sentry hooks (code path exists, DSN optional)
- pino structured logging
- AuditLog row written on mutations
- JWT cookie session via `jose`

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| P1 | Single region (bom1) — clients outside India see 300-500ms latency | 🟠 High | ⬜ |
| P2 | No `prisma migrate` workflow — uses `db push`, no committed migrations, no rollback path | 🔴 Critical | ⬜ |
| P3 | Sentry DSN not enforced — errors fall on the floor when unconfigured | 🟠 High | ⬜ |
| P4 | Encryption-at-rest secret (`INTEGRATION_ENC_KEY`) — not documented as required | 🟠 High | ⬜ |
| P5 | No rate limiting on most authenticated routes — only on a few public ones | 🟠 High | ⬜ |
| P6 | Cron auth uses shared secret in querystring | 🟡 Medium | ⬜ |
| P7 | No DB backup automation verified — no documented restore drill | 🔴 Critical | ⬜ |
| P8 | Pino logs go to stdout only — no aggregation beyond Vercel Logs (7d) | 🟡 Medium | ⬜ |
| P9 | No uptime / synthetic checks | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] `prisma migrate` with committed migrations
- [ ] Sentry DSN in env, source maps uploaded on build, alert routing
- [ ] DB restore drill documented (do it once, screenshot, write runbook)
- [ ] Rate limit defaults on every API route via middleware
- [ ] Uptime monitoring (Better Stack / Cronitor / Vercel native)
- [ ] Edge cache headers on static portal pages
- [ ] Backups: confirm Neon point-in-time recovery enabled + tested

**Effort:** 5-7 days

---

## M1. Auth & RBAC

📄 **Deep dive:** [`docs/modules/M1-auth-rbac.md`](docs/modules/M1-auth-rbac.md) — user types, flows, permissions, gaps

**Scope:** Signup, login (email/pw + mobile OTP + Google SSO), sessions, password reset, team invites, role + permission gating, DPDP consent, audit log.

### Working ✅
- Email/pw signup + login
- Mobile OTP signup/login via MSG91 (dev fallback)
- Google OAuth SSO
- Magic-link team invite acceptance
- Password reset email flow
- JWT cookie session
- Role-based permissions (Admin/Manager/custom + 30+ permission keys)
- RLS at DB layer
- DPDP consent captured at signup
- AuditLog rows on writes
- Settings → Members + Roles + Teams UIs
- Post-login lands on `/app/setup` (June 4)

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| A1 | No 2FA enforcement option for owner accounts | 🟠 High | ⬜ |
| A2 | Session revocation — no "log out all devices" / no session table | 🟠 High | ⬜ |
| A3 | No login throttling per email — only per IP. Credential stuffing risk | 🟠 High | ⬜ |
| A4 | Password policy — no enforced complexity, no breached-password check | 🟡 Medium | ⬜ |
| A5 | OTP — 6-digit codes, no exponential backoff visible | 🟡 Medium | ⬜ |
| A6 | No account lockout after repeated failed logins | 🟡 Medium | ⬜ |
| A7 | JWT_SECRET rotation — no documented process | 🟡 Medium | ⬜ |
| A8 | Email change flow — needs verification | 🟡 Medium | ⬜ |
| A9 | **No automated tests for permission matrix** — one wrong check leaks data | 🔴 Critical | ⬜ |

### Production-grade bar
- [ ] TOTP 2FA via `speakeasy` (already installed)
- [ ] Session table → revoke on password change + log-out-all-devices
- [ ] Login throttling by email AND IP (5/15 min)
- [ ] Password complexity + breached-password check
- [ ] Account email change with re-verify
- [ ] Test suite: every permission key × every role × every protected route
- [ ] Audit log retention policy

**Effort:** 4-5 days

---

## M2. Tenant Onboarding & Initial Setup

**Scope:** Account provision, AI onboarding wizard, brand, catalog, members, teams, scheduling, integrations.

### Working ✅
- Provision on signup: Tenant + Owner + Pipeline + Stages + Admin Role + ProposalTemplate + AIConfig + sample data
- Per-BusinessType seeds (wedding/photog/coach/etc.)
- AI Onboarding wizard 5 steps with Stage-A extract + per-section accept
- Setup checklist at `/app/setup` (7 items, completion derived from data)
- Brand editor (logo, brand color)
- Catalog UI (`CustomTable + CustomRow`)
- Members + Teams + Roles UIs
- Settings → Scheduling
- Settings → Integrations (per-tenant connect cards)
- "Re-do AI onboarding" entry point

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| O1 | Onboarding wizard runs AI on every step — slow + costly; no caching | 🟡 Medium | ⬜ |
| O2 | Setup checklist derived, not stored — recomputed every page load | 🟡 Medium | ⬜ |
| O3 | No "skip onboarding" path | 🟡 Medium | ⬜ |
| O4 | Member invite emails from platform Resend — vendor's invitees see "Avantus" sender | 🟠 High | ⬜ |
| O5 | No CSV import for catalog or contacts | 🟠 High | ⬜ |
| O6 | No business-type change after signup | 🟡 Medium | ⬜ |
| O7 | Catalog UI is barebones — power users need bulk edit | 🟡 Medium | ⬜ |
| O8 | **No tenant-deletion / right-to-erasure flow** (DPDP) | 🔴 Critical | ⬜ |
| O9 | No "demo data" cleanup button | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] CSV import for catalog rows + contacts
- [ ] Per-tenant data export (extends existing `/api/workspace/export`)
- [ ] DPDP tenant deletion: 30-day soft delete → permanent purge
- [ ] Cache setup checklist for 5 min per tenant
- [ ] Bulk catalog edit
- [ ] Member invites send from vendor's connected Resend domain (depends on M7)
- [ ] "Clear sample data" button on `/app/setup`

**Effort:** 4-5 days

---

## M3. Lead Management

**Scope:** Lead forms, pipelines, scoring, drips, kanban, AI suggestions, conversion to project.

### Working ✅
- 4 form templates (Inquiry, Quote request, Discovery call, Contact)
- Categorized "+ Create new" picker with preview modal
- Action chain runtime: 7 action types
- Public form (`/f/[slug]`) with multi-step (form → scheduler embed)
- Action editor in form settings (add/reorder/configure)
- Submissions tab with action-result trace
- Lead pipeline (kanban + list)
- Lead scoring rules engine
- Drip sequences (BullMQ-backed)
- Contact dedupe by email/phone (June 4)
- Inbound WhatsApp creates Lead
- AI actions in project workspace (6 of them)
- "Convert Opportunity → Project" button

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| L1 | `/app/projects` mixes Opportunities + Projects on one board — confusing | 🟠 High | ⬜ |
| L2 | No conversion-rate-by-form report | 🟡 Medium | ⬜ |
| L3 | No lead source attribution (UTM/referrer) | 🟠 High | ⬜ |
| L4 | BotID currently log-only — public forms have no real anti-spam | 🟠 High | ⬜ |
| L5 | No lead deduplication across pipeline | 🟡 Medium | ⬜ |
| L6 | Drip enrollment only triggers on `lead.created` — stage-change drips unwired | 🟡 Medium | ⬜ |
| L7 | No lead assignment / round-robin | 🟠 High | ⬜ |
| L8 | **WhatsApp webhook routes by "first tenant" not phone_number_id — multi-tenant broken** | 🔴 Critical | ⬜ |
| L9 | Action-chain editor doesn't preview the public form after edits | 🟡 Medium | ⬜ |
| L10 | No SLA timer on new leads | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] Conversion funnel report
- [ ] UTM capture on form post
- [ ] BotID enforcement (after wiring `<BotIdClient />` to public pages)
- [ ] Stage-change drips wired
- [ ] Lead assignment: manual + round-robin
- [ ] WhatsApp webhook routes by `phone_number_id` → Tenant
- [ ] SLA tracker per lead
- [ ] Lead dedupe with merge UI

**Effort:** 5-7 days

---

## M4. Proposals, Contracts, eSign, Invoicing, Payments

**Scope:** AI proposals, block template builder, contracts, embedded eSign, invoices with GST, payment links, schedules, reconciliation.

### Working ✅
- AI proposal generator (Stage-A → Stage-B → Stage-C)
- Proposal editor + share token portal
- Block template builder (14 block types, dnd-kit + Tiptap, history, mobile preview, AI rewrite, merge fields)
- Custom contracts with merge fields + render
- DocuSign embedded signing (iframe overlay on portal)
- Digio (Aadhaar) signing scaffold
- Auto-download + auto-file signed PDF
- Razorpay payment links + checkout + webhook reconciliation
- UPI / Net Banking / mandate
- Per-tenant Razorpay + DocuSign + Digio via Settings → Integrations
- Invoice numbering sequence
- Payment schedule auto-creation
- GST split (CGST/SGST/IGST) + SAC codes
- GSTR-1/3B export

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| M1 | **Money flow — platform Razorpay by default; vendor needs to connect own** | 🔴 Critical | ❓ (D1 below) |
| M2 | No proposal HTML sanitization — block-builder text can include arbitrary HTML | 🟠 High | ⬜ |
| M3 | No proposal versioning UX — model exists, no diff view | 🟡 Medium | ⬜ |
| M4 | **No proposal analytics** — `ProposalEvent` rows exist, no UI | 🟠 High | ⬜ |
| M5 | Aadhaar eSign untested end-to-end with real Digio creds | 🟠 High | ⬜ |
| M6 | No retry queue for failed Razorpay webhooks — daily sweep only | 🟠 High | ⬜ |
| M7 | DocuSign error UX limited for `.demo`/`.invalid` emails | 🟡 Medium | ⬜ |
| M8 | **No invoice PDF generation** — HTML only | 🟠 High | ⬜ |
| M9 | TDS reconciliation exists but untested | 🟡 Medium | ⬜ |
| M10 | GST IRP integration scaffolded only | 🟠 High | ⬜ |
| M11 | No "send via WhatsApp" button on proposal share | 🟡 Medium | ⬜ |
| M12 | PCI compliance scope not documented | 🟡 Medium | ⬜ |
| M13 | Proposal acceptance with no contract sign — no proof of consent | 🟠 High | ⬜ |
| M14 | Payment received → no auto-Project if proposal not linked | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] HTML sanitization (DOMPurify) at write-time in block builder
- [ ] Proposal analytics: opens / scroll / hover heatmap
- [ ] Proposal version diff view
- [ ] Razorpay BYO setup wizard in onboarding
- [ ] Digio end-to-end smoke test
- [ ] Invoice PDF generation
- [ ] GST IRP per-tenant finished
- [ ] WhatsApp send for proposals
- [ ] Inline "Accept terms" contract checkbox audit trail
- [ ] Payment webhook retry queue

**Effort:** 10-14 days (biggest single chunk)

---

## M5. Project Delivery (post-conversion)

**Scope:** Project workspace, tasks, files, messages, calendar, payments, team assignment, AI actions.

### Working ✅
- Rich project workspace at `/app/projects/[id]`
- Customizable pipeline stages per business type
- Tasks: rich composer, kanban + list, smart picker, estimate/actual minutes
- Files: R2 upload, polymorphic visibility, categorized
- Per-project calendar tab
- Per-project messages thread
- Activity feed
- AI workspace actions (6 of them)
- Team assignment with inheritance
- Client portal (`/c/[token]`)
- Collaborator polymorphism (User / Contact / Team)
- Project financials tab
- My Work + Team Workload pages
- Per-business-type task templates auto-seeded on conversion

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| D1 | No project-level Gantt / timeline view | 🟡 Medium | ⬜ |
| D2 | No file versioning — upload replaces | 🟡 Medium | ⬜ |
| D3 | No internal chat / @mentions | 🟡 Medium | ⬜ |
| D4 | **No expense tracking** | 🟠 High | ⬜ |
| D5 | No time tracking — `estimateMinutes` exists, no timer | 🟡 Medium | ⬜ |
| D6 | No project archive button | 🟡 Medium | ⬜ |
| D7 | Cross-project search limited | 🟡 Medium | ⬜ |
| D8 | No project template duplication | 🟡 Medium | ⬜ |
| D9 | No per-task client-visibility toggle | 🟡 Medium | ⬜ |
| D10 | No daily digest emails | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] Expense tracking with category + receipt
- [ ] Time tracker on tasks
- [ ] @mentions in activity feed
- [ ] Daily digest email per user
- [ ] File versioning (keep last 5)
- [ ] Cross-project search bar
- [ ] Project template duplication

**Effort:** 6-8 days

---

## M6. Client-facing surfaces

**Scope:** `/p` (proposal portal), `/f` (lead form), `/book` (booking), `/c` (collaborator portal), `/r` (reviews), `/i` (invoices).

### Working ✅
- `/p/[token]` proposal portal (blocks, embedded sign, pay, accept/decline/request changes)
- `/f/[slug]` lead form with multi-step
- `/book/[slug]` booking with ICS confirmation
- `/c/[token]` collaborator portal
- `/r/[token]` review collection
- `/i/[token]` invoice portal
- Brand color + cover image on all public pages
- Mostly mobile responsive

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| C1 | **Mobile UX** — works but not mobile-first | 🟠 High | ⬜ |
| C2 | No PWA — no install prompt | 🟡 Medium | ⬜ |
| C3 | **Share tokens never expire/rotate** — leak = permanent access | 🟠 High | ⬜ |
| C4 | No client password/PIN gate | 🟡 Medium | ⬜ |
| C5 | No i18n in portal (Hindi/English wired tenantside) | 🟡 Medium | ⬜ |
| C6 | Proposal print stylesheet rough | 🟡 Medium | ⬜ |
| C7 | No edge caching of portal HTML | 🟡 Medium | ⬜ |
| C8 | No SEO meta / OG tags | 🟡 Medium | ⬜ |
| C9 | No multi-project client view | 🟡 Medium | ⬜ |
| C10 | **No client-side Sentry on portal pages** | 🟠 High | ⬜ |

### Production-grade bar
- [ ] Mobile-first redesign of `/p/[token]`
- [ ] Share token expiry (default 90 days) + rotation API
- [ ] Optional PIN gate
- [ ] Hindi portal translation
- [ ] Edge cache 60s + stale-while-revalidate
- [ ] OG tags + favicon per tenant
- [ ] Client-side Sentry

**Effort:** 5-7 days

---

## M7. Integrations & connectors

**Scope:** External services — AI, payments, eSign, comms, calendar, accounting, compliance, storage. Platform vs business level.

### Working ✅
- Credential resolver (`lib/integrations/resolve.ts`) — per-tenant first, env fallback
- Integration registry with metadata per provider
- Settings → Integrations rewrite with per-provider connect modals
- DocuSign per-tenant (BYO)
- Digio per-tenant (BYO)
- Razorpay per-tenant (BYO)
- Resend per-tenant (BYO)
- MSG91 per-tenant
- WhatsApp per-tenant
- GST IRP per-tenant
- Google Calendar per-user OAuth
- Generic `/api/oauth/[provider]/start` (Gmail + Google Calendar wired)
- Credential encryption at rest (`crypto.ts`)
- Demo-mode banner on dashboard

### Gaps
| ID | Issue | Severity | Status |
|---|---|---|---|
| I1 | **Razorpay Route partnership** — not done; PA license risk at scale | 🔴 Critical | ❓ (D1) |
| I2 | **WhatsApp BSP** — Meta requires per-tenant WABA; current code single-tenant | 🔴 Critical | ❓ (D2) |
| I3 | Calendly / Zoom / QuickBooks OAuth — not implemented | 🟡 Medium | ⬜ |
| I4 | No "Test connection" button on integration cards | 🟠 High | ⬜ |
| I5 | No per-tenant integration quota tracking | 🟠 High | ⬜ |
| I6 | Resend domain verification — key field only; no SPF/DKIM lookup | 🟠 High | ⬜ |
| I7 | Webhook signature verification failures silent-rejected | 🟡 Medium | ⬜ |
| I8 | `INTEGRATION_ENC_KEY` rotation plan undocumented | 🟠 High | ⬜ |
| I9 | No "I'm leaving" data export for integrations | 🟡 Medium | ⬜ |
| I10 | OAuth state cookie uses `SameSite=Lax` not `Strict` | 🟡 Medium | ⬜ |
| I11 | Refresh token rotation handled for Google; others assume no rotation | 🟡 Medium | ⬜ |
| I12 | Token revocation on Disconnect — most providers we just delete the row | 🟡 Medium | ⬜ |

### Production-grade bar
- [ ] "Test connection" on every connected card
- [ ] Per-tenant usage dashboard
- [ ] Resend domain wizard (SPF/DKIM polling)
- [ ] Razorpay: lock in Route partnership OR document BYO-only
- [ ] WhatsApp: integrate Gupshup/AiSensy OR document BYO-only
- [ ] Webhook signature failure logs + Sentry breadcrumb
- [ ] Token revocation on Disconnect
- [ ] `INTEGRATION_ENC_KEY` rotation runbook

**Effort:** 8-10 days

---

## Go-live readiness scorecard

| Module | Functional | Production-grade | Status |
|---|:---:|:---:|---|
| **M0 Platform** | 80% | 55% | Needs hardening |
| **M1 Auth & RBAC** | 95% | 60% | 2FA + tests outstanding |
| **M2 Onboarding** | 85% | 55% | CSV import + tenant deletion |
| **M3 Leads** | 80% | 55% | UTM + BotID + WA routing |
| **M4 Money** | 80% | **40%** | **Biggest gap** |
| **M5 Delivery** | 90% | 60% | Time / expenses / digest |
| **M6 Client surfaces** | 80% | 45% | Mobile-first redesign |
| **M7 Integrations** | 80% | 45% | Test conn + quotas |

**Overall:** functional ~85%, production-grade ~50%.

---

## Phased go-live plan

### Phase A — "Must fix to go live" (2 weeks)
Blockers + critical security/compliance.

| Order | Module | Item | Days |
|:---:|:---:|---|:---:|
| 1 | M0 | P2 prisma migrate workflow + rollback | 1 |
| 2 | M0 | P7 Neon backup verification + restore drill | 0.5 |
| 3 | M1 | A9 role × permission test suite | 1.5 |
| 4 | M2 | O8 DPDP tenant deletion | 1 |
| 5 | M3 | L8 WhatsApp webhook tenant routing | 1 |
| 6 | M3 | L4 BotID client component + enforce | 0.5 |
| 7 | M4 | M2 proposal HTML sanitization | 0.5 |
| 8 | M4 | M8 invoice PDF generation | 1 |
| 9 | M4 | M13 proposal accept consent trail | 0.5 |
| 10 | M6 | C10 client-side Sentry on portal | 0.5 |
| 11 | M7 | I4 integration "Test connection" buttons | 1 |
| 12 | M1 | A3 login throttling per email | 0.5 |

### Phase B — "First customer can succeed" (1.5 weeks)

| Order | Module | Item | Days |
|:---:|:---:|---|:---:|
| 13 | M2 | O5 CSV import (catalog + contacts) | 1 |
| 14 | M7 | I6 Resend domain wizard | 1 |
| 15 | M2 | O4 member invites via vendor's domain (needs 14) | 0.5 |
| 16 | M3 | L7 lead assignment / round-robin | 1 |
| 17 | M3 | L1 Opportunities/Projects board split | 1 |
| 18 | M6 | C3 share-token expiry + rotation | 0.5 |
| 19 | M4 | M1/I1 Razorpay strategy decision + implementation | 2-3 |
| 20 | M7 | I2 WhatsApp BSP decision + implementation | 2-3 |

### Phase C — "Pleasure to use" (1.5 weeks)
Polish + retention.

| Order | Module | Item |
|:---:|:---:|---|
| 21 | M6 | C1 mobile-first portal redesign |
| 22 | M6 | C5 Hindi portal translation |
| 23 | M5 | D4 expense tracking |
| 24 | M5 | D5 time tracker |
| 25 | M5 | D10 daily digest emails |
| 26 | M3 | L2 conversion funnel report |
| 27 | M4 | M4 proposal analytics dashboard |
| 28 | M3 | L3 UTM capture |
| 29 | M4 | M11 WhatsApp send for proposals |

### Phase D — "Scale-ready" (1 week)
Pre-traction hardening.

| Order | Module | Item |
|:---:|:---:|---|
| 30 | M0 | P1 multi-region or edge cache |
| 31 | M1 | A1 2FA |
| 32 | M1 | A2 session table + revoke |
| 33 | M6 | C2 PWA shell |
| 34 | M5 | D7 cross-project search |
| 35 | M7 | I5 per-tenant integration quotas |

**Total:** ~6 weeks of focused work for full production-grade.
**First-10-customers minimum:** Phase A + B = 3.5 weeks.

---

## Decisions needed (❓)

| ID | Decision | Options | Status |
|---|---|---|---|
| **D1** | Razorpay strategy | (a) Route partnership · (b) BYO-only · (c) status quo (NOT recommended) | ⬜ Open |
| **D2** | WhatsApp strategy | (a) Build BSP · (b) Resell via Gupshup/AiSensy · (c) Defer | ⬜ Open |
| **D3** | Multi-region | bom1 only vs add edge cache + 2nd region | ⬜ Open |
| **D4** | DocuSign vs Aadhaar priority | Which is the default? | ⬜ Open |
| **D5** | Pricing model | Per-tenant sub? Per-feature? Free + paid integrations? | ⬜ Open |
| **D6** | First 10 customers' profile | Single vertical or mixed? | ⬜ Open |
| **D7** | Hindi mandatory at launch? | Y / partial / N | ⬜ Open |
| **D8** | Support model at launch | In-app chat / email / Calendly | ⬜ Open |

---

## Working agreements

- **One task at a time.** Each task gets typecheck → build → deploy → verify in prod before the next starts. This pace caught the BotID silent-drop bug; keep it.
- **No silent failures.** If a feature can fail, it must log a warning and return a clear error to the user. Never `200 OK` while losing data.
- **DB writes always verifiable.** Every action that writes should have either: a visible UI confirmation, a Submissions/Activity row, or a clear DB-queryable trail.
- **Document credentials externally.** All sensitive setup steps go in `SECRETS.md` + `RUNBOOK.md` so I don't have to reconstruct them every session.
- **Update this file** at the start of each work session — change Status column for any item touched.

---

## Change log

| Date | Change |
|---|---|
| 2026-06-04 | Document created. Captured 7-module audit + Phase A-D plan + 8 open decisions. |
| 2026-06-04 | Added `docs/modules/M1-auth-rbac.md` — full deep dive for Module 1 (user types, flows, permissions, gaps, plan). |

---

## Quick reference

- **Repo root:** `/Users/vickyanand/Desktop/projects/honeybook`
- **Prod URL:** https://honeybook-virid.vercel.app
- **DB:** Neon `ep-blue-hall-apyxiwto.c-7.us-east-1.aws.neon.tech`
- **Worker:** Render (BullMQ)
- **Storage:** Cloudflare R2
- **Sibling docs:** `AGENTS.md`, `CLAUDE.md`, `DEPLOY-CHECKLIST.md`, `FEATURES.md`, `README.md`, `RUNBOOK.md`, `SECRETS.md`

---

## How to use this file in future sessions

1. **Starting a new session?** Open this file first. Look at "Decisions needed" + the current Phase you're in.
2. **Updating progress?** Change ⬜ → ✅ on the relevant row when a fix lands in prod. Add a Change log entry.
3. **Adding a finding?** Append to the relevant module's Gaps table with a new ID, severity, and ⬜ status.
4. **Stuck?** Reference the **Working agreements** section — they're the operating rules.
