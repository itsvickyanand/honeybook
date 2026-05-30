# Deployment Checklist & Credential Manifest

This is the single source of truth for what you need to provide to take this
deployment live. Items are ordered by impact — providers earlier in the list
unlock more user-facing functionality.

---

## 0 · Already done in this session

- ✅ Vercel project linked: **`dev-31652152/honeybook`**, deployed at
  https://honeybook-virid.vercel.app
- ✅ Neon Postgres provisioned (`neon-emerald-car`), schema + seed in place
  on both `production` and `development` environments
- ✅ Database migration applied (Task / PaymentSchedule / PlatformAdmin /
  Integration models, plus Project↔Proposal back-links)
- ✅ 5 demo tenants seeded (`owner@catering.demo` etc., password `demo1234`)
- ✅ Platform admin seeded: **`admin@platform.local` / `admin123!`**
  → Sign in at **`/admin/login`**
- ✅ Worker resilience: API routes degrade gracefully when Redis is missing
  (critical jobs run inline; heavy jobs are skipped + logged)
- ✅ Galleries pages migrated to `storage.publicUrl()` (will work on R2/S3)
- ✅ Three cron jobs registered in `vercel.json`:
  - `payment-schedule-due` — daily 06:00 UTC
  - `overdue-invoice-sweep` — daily 07:00 UTC
  - `task-reminders` — daily 09:00 UTC

---

## 1 · Required for paying customers (Phase 0 blockers)

These are non-optional. The product can't take a payment without them.

| Env var | Where to get it | Where to paste |
|---|---|---|
| `REDIS_URL` | redis.com → free tier → "Database details" connect string (`rediss://default:<pwd>@<host>:<port>`) | Vercel env (production) + Render env (worker) |
| `RAZORPAY_KEY_ID` | razorpay.com dashboard → Settings → API Keys → Generate Key | Vercel env |
| `RAZORPAY_KEY_SECRET` | Shown once when generating the Key ID above | Vercel env |
| `RAZORPAY_WEBHOOK_SECRET` | razorpay.com dashboard → Webhooks → Create Webhook for `https://<your-domain>/api/webhooks/razorpay` → set & copy secret | Vercel env |
| `RESEND_API_KEY` | resend.com → API Keys → Create | Vercel env |
| `RESEND_FROM_EMAIL` | A verified sender on a domain you control (e.g. `noreply@yourdomain.com`) — Resend → Domains → verify DNS | Vercel env |
| `S3_ENDPOINT` | dash.cloudflare.com → R2 → Manage R2 API tokens (note your account ID at top right) → `https://<accountId>.r2.cloudflarestorage.com` | Vercel env |
| `S3_ACCESS_KEY` | R2 → API tokens → "Create API token" with Read+Write on the bucket → Access Key ID | Vercel env |
| `S3_SECRET_KEY` | Shown alongside Access Key ID; **save immediately, it's not shown again** | Vercel env |
| `S3_BUCKET` | R2 → Create bucket (suggest `honeybook-prod`) | Vercel env |
| `APP_URL` | The production domain you'll point users at (e.g. `https://honeybook.com`); fine to start with `https://honeybook-virid.vercel.app` | Vercel env |
| `APP_ENCRYPTION_KEY` | Generate: `openssl rand -base64 32` — used to encrypt OAuth tokens + per-tenant API keys stored in DB | Vercel env |

**How to set them in Vercel** (once you have the values):
```bash
vercel env add REDIS_URL production
# … paste value when prompted, repeat for each
```
Or paste them all at once via the dashboard at
https://vercel.com/dev-31652152/honeybook/settings/environment-variables

**Worker (Render):**
1. Push the repo to GitHub (the existing remote uses a non-standard SSH alias `git@github-personal:itsvickyanand/honeybook.git` — Vercel + Render need a plain `git@github.com:user/repo.git` remote)
2. render.com → New → Blueprint → connect repo (it picks up `render.yaml`)
3. Set the secrets listed in `render.yaml` (every `sync: false` value)

---

## 2 · Strongly recommended (Phase 1 — week 1)

Customers will still complete the flow without these, but the experience is
degraded.

| Env var | Why | Source |
|---|---|---|
| `JWT_SECRET` | ✅ already set; rotate if you suspect leakage | `openssl rand -base64 64` |
| `PLATFORM_JWT_SECRET` | Set in production so platform-admin sessions use a key independent from tenant sessions | `openssl rand -base64 64` |
| `MSG91_AUTH_KEY` | Transactional SMS for OTP + delivery confirmation reminders | msg91.com → settings |
| `MSG91_SENDER_ID` | 6-char DLT-approved sender ID (India SMS regulation) | msg91.com |
| `GOOGLE_CLIENT_ID` | OAuth for Google Calendar sync + Gmail send | console.cloud.google.com → APIs & Services → OAuth client (Web), authorized redirect URI: `<APP_URL>/api/oauth/google/callback` |
| `GOOGLE_CLIENT_SECRET` | (same) | (same) |
| `WHATSAPP_BSP` | `meta` / `gupshup` / `interakt` — picks the API surface used | Whoever your BSP is |
| `WHATSAPP_TOKEN` | Permanent access token for WhatsApp Cloud API | developers.facebook.com → Apps → WhatsApp |
| `WHATSAPP_PHONE_ID` | Phone-number-ID from the same dashboard | (same) |
| `SENTRY_DSN` | Error tracking | sentry.io → Project Settings → Client Keys |
| `CRON_SECRET` | Bearer token for cron route auth fallback (Vercel cron header already auth's; this is for replays) | `openssl rand -base64 32` |

---

## 3 · Optional / per-feature (Phase 2+)

Connect these via **`/admin/integrations`** (platform-scoped) or
**`/app/settings/integrations`** (tenant-scoped) when you have credentials.
Most can also be set as env vars for backward compatibility.

| Provider | Scope | Used for |
|---|---|---|
| Calendly | Platform | Sales-call scheduling for the SaaS company (per your request) |
| Zoom | Tenant | Auto-generate meeting links for client calls |
| Digio | Tenant | Aadhaar-based eSign on contracts (legally binding in India) |
| Zoho Books | Tenant | Push invoices + payments to Zoho |
| Tally agent | Tenant | XML envelope sync to Tally Prime |
| GST IRP | Tenant | E-invoicing IRN + signed QR (required above ₹5Cr turnover) |
| Voyage AI / OpenAI | Platform | Embeddings for catalog semantic search + proposal autofill |
| Stripe | Tenant | International payment acceptance |
| QuickBooks | Tenant | Non-IN markets accounting sync |

---

## 4 · DNS / Domain (when ready to brand)

1. Decide a domain (e.g. `app.yourbrand.com` or root domain).
2. Vercel → Project → Settings → Domains → Add. Vercel shows CNAME/A
   records to set at your DNS provider.
3. Update env var `APP_URL` to the new domain.
4. Update Razorpay webhook URL: `<new-domain>/api/webhooks/razorpay`.
5. Update Google OAuth redirect URI in Google Cloud Console.
6. Update Resend's verified sender if you change email-sending domain.

---

## 5 · GitHub remote fix (enables Vercel preview deploys + Render auto-deploy)

```bash
git remote set-url origin git@github.com:<your-user>/honeybook.git
# or:
git remote set-url origin https://github.com/<your-user>/honeybook.git
git push -u origin main
```

Then in Vercel: Project → Settings → Git → Connect Git repository.
Then in Render: Blueprints → New → connect same repo.

---

## 6 · Smoke-test plan after secrets are in

1. **Auth**: signup with `?bizType=catering` → expect 200 + tenant created.
2. **Proposal → Payment**: from a demo tenant → New proposal → send to a
   throwaway email → open in incognito → click "Pay deposit" → complete a
   ₹1 test payment (Razorpay test card `4111 1111 1111 1111`).
3. **Project auto-create**: after webhook fires, the demo tenant's
   `/app/projects` should show the new project with auto-seeded tasks.
4. **Client portal**: visit `/p/<shareToken>/project` — the new client
   portal should render with the project status banner.
5. **Cron sanity**: hit `/api/cron/payment-schedule-due` with
   `Authorization: Bearer $CRON_SECRET` → should return `{ ok: true }`.
6. **Platform admin**: sign in at `/admin/login` with
   `admin@platform.local / admin123!` → change the password immediately
   via DB or seed re-run.

---

## 7 · Known follow-ups (NOT done in this session — track separately)

| Item | Why deferred |
|---|---|
| Real RLS adoption across all read paths | The codebase has ~200 direct `prisma.X` calls; a proper migration plan was spawned as a side task |
| Live test of GST IRN, Digio, Tally, Zoho | Need your real credentials + sandbox accounts |
| Mobile responsive audit of every page | The new pages I built are mobile-first; existing pages weren't re-audited |
| Sentry full wiring | `lib/sentry.ts` is a no-op shim; production needs `@sentry/nextjs` + `instrumentation.ts` |
| Per-tenant integration configuration UI extension | Built the new `/api/integrations` + registry; the existing `/app/settings/integrations` page still uses the older hardcoded list — they coexist; rationalize in Phase 2 |
| OAuth callback handlers for Calendly / Zoom / QuickBooks | Routes don't exist yet; UI shows the "Connect" button but it'll 404 until callbacks land |
| Multi-event Project (one project, multiple proposals) | Schema supports it (`Project.proposals: Proposal[]`), UX assumes 1:1 still |
| Setup wizard step-by-step completion detection | Steps render but the "X/7 completed" logic is approximate |
