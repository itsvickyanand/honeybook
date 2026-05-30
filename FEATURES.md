# Features & Flows

What's been built, and how each piece connects in the end-to-end business
journey. Items marked **🆕** were added in the recent build sessions; the rest
were already in the codebase and are listed so the full flow makes sense.

Production: https://honeybook-virid.vercel.app

---

## The core business flow (Lead → Cash → Delivery)

```
  LEAD CAPTURE          QUALIFY            PROPOSE           BOOK (PAY)         DELIVER            CLOSE
 ┌────────────┐      ┌───────────┐     ┌────────────┐    ┌────────────┐    ┌────────────┐    ┌──────────┐
 │ Lead form  │      │ Pipeline  │     │ Proposal   │    │ Invoice +  │    │ Project +  │    │ Final    │
 │ Contact    │ ───► │ stages +  │ ──► │ (AI draft) │ ─► │ Razorpay   │ ─► │ Tasks      │ ─► │ invoice +│
 │ form       │      │ lead score│     │ → share    │    │ payment    │    │ auto-      │    │ review   │
 │ CSV import │      │           │     │   link     │    │ link       │    │ created 🆕 │    │ request  │
 └────────────┘      └───────────┘     └────────────┘    └────────────┘    └────────────┘    └──────────┘
       │                   │                  │                 │                  │                │
   Contact +           Activity           ProposalEvent     PaymentWebhook    onInvoicePaid()    Drip
   Lead created        timeline           (sent/viewed/     → reconcile       fan-out 🆕        sequence
                                           accepted)         → invoice PAID
```

---

## 1 · Lead capture

| Feature | Where | Flow |
|---|---|---|
| Public lead forms | `/app/forms` → embed on any website | Visitor submits → Contact + Lead created → drip sequence (if `lead.created` trigger) fires → lands in pipeline "New" stage |
| Contact forms | `/app/forms` | Simpler inquiry form, same Contact creation path |
| Embed snippet | Form detail → "Copy embed" | Generates `<iframe>` code the vendor pastes on their site |
| CSV import | Contacts area | Bulk-create contacts |
| Lead scoring | `/app/settings/lead-scoring` | Rule-based 0–100 score shown on each lead |

## 2 · Pipeline / CRM

| Feature | Where | Flow |
|---|---|---|
| Kanban pipeline | `/app/leads` | Leads move through stages (New → Contacted → Qualified → Proposal Sent → Negotiation → Won / Lost). Stages seed per tenant on signup |
| Auto stage advancement | (automatic) | Proposal sent → lead auto-moves to "Proposal Sent"; payment received → "Won". Driven by `lifecycle.ts` |
| Activity timeline | per contact/lead | Every event (proposal sent, viewed, paid) logged as an Activity row |
| Clients directory | `/app/contacts` | All contacts, with detail pages |

## 3 · Proposals

| Feature | Where | Flow |
|---|---|---|
| AI-assisted proposal builder | `/app/proposals/new` | Brief → Claude parses → drafts line items from the service catalog → vendor edits |
| Versioning | proposal detail | Each edit snapshots a `ProposalVersion` |
| Share link | proposal → Send | Generates `/p/<shareToken>` public link, emails the client |
| Client portal (proposal) | `/p/[token]` | Client views branded proposal, accepts / requests changes / pays |
| Proposal events | (automatic) | SENT → VIEWED → ACCEPTED/DECLINED/CHANGES_REQUESTED, each logged + fan-out |
| Deposit support | proposal | `depositPercent` lets client pay a partial deposit to book |

## 4 · Invoicing & payments

| Feature | Where | Flow |
|---|---|---|
| Invoice generation | auto from proposal, or `/app/invoices/new` | Line items → GST split (CGST/SGST/IGST) → numbered on send |
| Razorpay payment links | client portal "Pay" | Creates Razorpay payment link → client pays UPI/card/netbanking |
| Webhook reconciliation | `/api/webhooks/razorpay` | Razorpay fires `payment.captured` → signature verified → Payment marked SUCCESS → `payment.reconcile` job → Invoice `amountPaid` + status updated → `onInvoicePaid` fan-out |
| Deposit auto-accept | (automatic) | Any successful payment against an unaccepted proposal flips it to ACCEPTED |
| **Payment schedules (installments)** 🆕 | `/api/payment-schedules`, project Payments tab | Define N installments (e.g. 25% booking / 50% pre-event / 25% delivery). A daily cron auto-issues an invoice when each item comes due |
| **Overdue sweep** 🆕 | daily cron | Past-due invoices flip to OVERDUE + reminder email to client |
| GST e-invoicing (IRN) | finance → GST hub | Submit B2B invoices to IRP for IRN + signed QR (needs IRP creds) |
| Finance hub | `/app/finance` | Tabbed: Overview / Payments / Invoices / Accounting / GST hub |

## 5 · Projects 🆕 (the post-booking workspace)

| Feature | Where | Flow |
|---|---|---|
| **Auto-create on payment** 🆕 | (automatic) | First payment against a proposal-linked invoice → `onInvoicePaid` creates a Project, links proposal + invoice, sets dates from the parsed brief |
| **Project detail page** 🆕 | `/app/projects/[id]` | Tabs: Overview / Tasks / Files / Messages / Payments / Team. Shows quoted/paid/balance KPIs |
| **Multi-proposal support** 🆕 | schema | One Project can hold multiple proposals/invoices (weddings = multiple events) — data layer ready |
| Project list | `/app/projects` | All projects with status |

## 6 · Tasks 🆕

| Feature | Where | Flow |
|---|---|---|
| **Task model + CRUD API** 🆕 | `/api/tasks`, `/api/tasks/[id]` | Create / update / status-toggle / delete |
| **Auto-seeded from templates** 🆕 | (automatic on project create) | Each BusinessType ships a task template (e.g. photographer: "Backup footage", "Deliver gallery within 30 days"). Tasks generated with due dates offset from the event date |
| **Global task inbox** 🆕 | `/app/tasks` | All tasks grouped: Overdue / Today / This week / Later / Done |
| **Project task tab** 🆕 | project → Tasks | Grouped open/done, inline add, assign, reorder |
| **Task reminders** 🆕 | daily cron | Tasks with `reminderHoursBefore` set → in-app notification before due |

## 7 · Client project portal 🆕

| Feature | Where | Flow |
|---|---|---|
| **Post-booking client view** 🆕 | `/p/[token]/project` | After paying, client sees: "Booking confirmed" hero, total/paid/balance, payment schedule status, deliverables (DELIVERY-category tasks only — internal prep hidden), invoices, vendor contact info. Branded with tenant logo + color |

## 8 · Calendar

| Feature | Where | Flow |
|---|---|---|
| Month grid | `/app/calendar` | Renders BOOKING / INTERNAL / BLOCKED events |
| Auto booking event | (automatic) | Paid proposal → CalendarEvent (type BOOKING) created on the event date |
| Google Calendar sync | settings → integrations | Push events to the vendor's Google Calendar (needs Google OAuth) |

## 9 · Communications

| Feature | Where | Flow |
|---|---|---|
| Inbox | `/app/inbox` | Threaded messages (ChatThread + Message) per contact/proposal |
| Email (Resend) | (automatic) | Receipts, proposal-sent, reminders. Queued via worker, or inline if Redis down |
| SMS (MSG91) | (automatic) | OTP + reminders (needs MSG91 key) |
| WhatsApp | (automatic) | Template messages (needs BSP creds) |
| Drip sequences | `/app/settings/drips` | Multi-step automated follow-ups triggered by lead.created / proposal.sent / proposal.viewed / manual |

## 10 · Files & deliverables

| Feature | Where | Flow |
|---|---|---|
| File uploads (R2) 🆕-fixed | throughout | Presigned PUT directly to Cloudflare R2; signed GET URLs for private access |
| Galleries | `/app/galleries` | Photo galleries shared with clients for approval |
| Documents + eSign | `/app/documents` | Contracts sent for Aadhaar e-sign via Digio (needs Digio creds) |

## 11 · Settings & workspace

| Feature | Where | Flow |
|---|---|---|
| **Brand + billing identity** 🆕 | `/app/settings/workspace` | Logo, brand color, GSTIN, PAN, address, contact, invoice footer — appears on invoices + client portal |
| Setup wizard | `/app/setup` | Onboarding checklist (plan, services, pipeline, import clients, first project, send proposal) |
| Team + roles | `/app/settings/team`, `/roles` | Invite users, Owner/Admin/Coordinator/Viewer roles + permissions |
| API keys | `/app/settings/api-keys` | Programmatic access |
| Outbound webhooks | settings | Notify external systems on events |
| 2FA / security | `/app/settings/security` | TOTP |
| Audit log | `/app/settings/audit` | Every create/update/delete/login |
| **Integrations** 🆕 | `/app/settings/integrations` | Connect tenant-level services |

## 12 · Platform admin 🆕 (the SaaS operator's console)

| Feature | Where | Flow |
|---|---|---|
| **Separate admin login** 🆕 | `/admin/login` | Distinct auth cookie (`hb_admin_session`) + separate JWT secret. `admin@platform.local` / `admin123!` |
| **Overview dashboard** 🆕 | `/admin` | Platform-wide KPIs: tenant count, users, proposals + value, payments captured, recent tenants |
| **Tenants list** 🆕 | `/admin/tenants` | Every tenant with users/proposals/projects/invoices counts |
| **Platform integrations** 🆕 | `/admin/integrations` | Connect platform-level services (Calendly for sales, Sentry, R2, AI providers, Redis) — these also serve as fallback creds for tenants |
| **Admin audit log** 🆕 | (automatic) | Every admin action recorded in PlatformAuditLog |

## 13 · Integration framework 🆕

| Feature | Where | Flow |
|---|---|---|
| **Provider registry** 🆕 | `src/lib/integrations/registry.ts` | 20 providers across payments/comms/calendar/scheduling/esign/accounting/AI/observability/compliance/storage. Each declares scope (platform/tenant), kind (oauth/apiKey), fields, env fallbacks |
| **Encrypted credential storage** 🆕 | `src/lib/integrations/crypto.ts` | AES-256-GCM encryption of OAuth tokens + API keys at rest in the Integration table |
| **Credential resolver** 🆕 | `src/lib/integrations/resolve.ts` | Runtime lookup: tenant creds → platform creds → env vars |
| **Connect/disconnect APIs** 🆕 | `/api/integrations/*`, `/api/admin/integrations/*` | Field-validated, encrypts on save |

---

## Infrastructure & resilience 🆕

| Concern | Solution |
|---|---|
| Hosting | Vercel (Mumbai `bom1` region), Fluid Compute |
| Database | Neon Postgres (pooled URL for app, direct URL for migrations) + pgvector/pg_trgm/citext |
| Queue/cache | Redis Cloud + BullMQ; **degrades gracefully** — critical jobs (payment reconcile, email, notifications) run inline if Redis is unreachable |
| Object storage | Cloudflare R2 (S3-compatible, signed URLs) |
| Background worker | Render service (`render.yaml`) running BullMQ consumers |
| Crons | 3 daily Vercel crons: payment-schedule-due, overdue-invoice-sweep, task-reminders |
| Secrets | Env vars on Vercel; tenant/platform integration creds encrypted in DB |

---

## Known gaps / follow-ups (documented, not yet done)

- Real Row-Level Security across all read paths (~200 call sites)
- OAuth callback handlers for Calendly / Zoom / QuickBooks (connect buttons exist, callbacks don't)
- Live testing of GST IRN, Digio eSign, Tally, Zoho with real credentials
- Mobile responsive audit of pre-existing pages
- `@sentry/nextjs` full wiring (shim in place)
- Setup wizard step auto-completion detection

See `DEPLOY-CHECKLIST.md` for the credential manifest and `SECRETS.md` for current values.
