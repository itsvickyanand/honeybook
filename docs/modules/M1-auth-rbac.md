# M1 — Auth & RBAC (Deep Dive)

> Companion to `MODULES.md`. Everything about the authentication, authorization,
> and user-access architecture: who can log in, what they see, how the system
> enforces it, what's working, what's broken, and how to make it production grade.
>
> **Last updated:** 2026-06-04
> **Status:** Functional 95% · Production-grade 60%

---

## Table of contents

1. [User types](#1-user-types)
2. [Platform admin login](#2-platform-admin-login)
3. [Feature inventory](#3-feature-inventory)
4. [Database models](#4-database-models)
5. [Authentication flows](#5-authentication-flows)
6. [Authorization layers (3-layer + RLS)](#6-authorization-layers)
7. [Permission matrix](#7-permission-matrix)
8. [Data access by user type](#8-data-access-by-user-type)
9. [Where data is allowed to flow](#9-where-data-is-allowed-to-flow)
10. [End-to-end user journey](#10-end-to-end-user-journey)
11. [Settings UIs](#11-settings-uis)
12. [What's working well](#12-whats-working-well)
13. [Gaps & risks](#13-gaps--risks)
14. [Production-grade bar](#14-production-grade-bar)
15. [File map](#15-file-map)
16. [Test-it-yourself checklist](#16-test-it-yourself-checklist)
17. [Suggested execution order](#17-suggested-execution-order)
18. [Open decisions](#18-open-decisions)

---

## 1. User types

Four distinct kinds of users interact with this system. Each has a different auth model and data scope.

```
                    ┌──────────────────────┐
                    │   PLATFORM ADMIN     │  ← runs Avantus itself
                    │   (you / Avantus)    │     /admin
                    │                      │     auth: PlatformAdmin
                    │   Sees: all tenants  │     table (separate from User)
                    └──────────┬───────────┘
                               │
                               │ creates / suspends
                               ▼
        ┌─────────────────────────────────────────────────┐
        │                  TENANT                         │
        │  (a wedding planner's company = 1 row in DB)    │
        └──────────────────┬──────────────────────────────┘
                           │
              ┌────────────┼─────────────────────────┐
              ▼            ▼                         ▼
       ┌──────────┐  ┌───────────┐         ┌──────────────────┐
       │  OWNER   │  │ STAFF     │         │ COLLABORATOR     │
       │  (Admin) │  │ (Manager, │         │ (freelance vendor│
       │          │  │  custom   │         │  on a project)   │
       │          │  │  role)    │         │                  │
       │  Logs in │  │ Logs in   │         │ Logs in via      │
       │  /login  │  │ /login    │         │ /c/[token]       │
       │          │  │           │         │ (no password)    │
       └────┬─────┘  └─────┬─────┘         └────────┬─────────┘
            │              │                        │
            └──────┬───────┘                        │
                   │                                │
              All in User table                 ProjectMember row
              with Role.permissions             with kind=COLLABORATOR
                   │                                │
                   ▼                                ▼
              Full vendor app                  Scoped portal only
              `/app/*`                         `/c/[token]`


                ┌─────────────────────────────────┐
                │  CLIENT                         │  ← the end customer
                │  (no login at all)              │     (bride, restaurant,
                │                                 │      corporate buyer)
                │  Lands on token URLs:           │
                │   /p/[token]  ← proposal        │
                │   /i/[token]  ← invoice         │
                │   /r/[token]  ← review form     │
                │   /f/[slug]   ← lead form       │
                │   /book/[slug] ← booking page   │
                └─────────────────────────────────┘
                Stored as `Contact` row, NEVER as User.
                Auth = possession of the share token.
```

### Quick summary

| User type | Auth | Stored in | Sees | Lives at |
|---|---|---|---|---|
| **Platform Admin** | email + pw | `PlatformAdmin` table | All tenants | `/admin/*` |
| **Owner** | email/pw, OTP, Google | `User` table (Role=Admin) | All of own tenant | `/app/*` |
| **Staff** | email/pw, OTP, Google | `User` table (custom role) | Scoped within tenant | `/app/*` |
| **Collaborator** | share token | `ProjectMember` row | One project, scoped tasks/files | `/c/[token]` |
| **Client** | share token | `Contact` row | One proposal/invoice/etc. | `/p/[token]` etc. |

---

## 2. Platform admin login

```
┌──────────────────────────────────────────────────────────────────┐
│ PLATFORM ADMIN LOGIN                                             │
├──────────────────────────────────────────────────────────────────┤
│  URL:        /admin                                              │
│  Login URL:  /admin/login                                        │
│  Auth route: /api/admin/login                                    │
│                                                                  │
│  Storage:    PlatformAdmin table (NOT the User table)            │
│  Schema:                                                         │
│    model PlatformAdmin {                                         │
│      id           String                                         │
│      email        String  @unique                                │
│      passwordHash String                                         │
│      fullName     String                                         │
│      role         String  // 'super_admin' | 'support'           │
│      lastLoginAt  DateTime?                                      │
│    }                                                             │
│                                                                  │
│  Session: separate JWT cookie `hb_admin_session`                 │
│           verified by `requirePlatformAdmin()` in                │
│           src/lib/platform-auth.ts                               │
│                                                                  │
│  Pages:    /admin               — multi-tenant dashboard         │
│            /admin/tenants       — list all tenants               │
│            /admin/integrations  — platform-level keys            │
│            /admin/audit         — all-tenant audit log           │
│            /admin/billing       — subscriptions / usage          │
└──────────────────────────────────────────────────────────────────┘
```

### Creating the first platform admin

There's no signup UI. Three options to bootstrap:

1. **CLI script** (not yet built): `npx tsx scripts/create-platform-admin.ts you@example.com 'YourPassword'`
2. **Direct DB insert** with bcrypt-hashed password
3. **Have the engineer (me) insert a row** while you give the email + password to hash

### Recommended next step

Build the CLI script (`scripts/create-platform-admin.ts`) so future admin onboarding is repeatable and documented.

---

## 3. Feature inventory

### Authentication methods (4)

| # | Method | Where | Flow |
|---|---|---|---|
| 1 | **Email + password** | `/login` ↔ `POST /api/auth/login` | bcrypt verify → JWT cookie |
| 2 | **Mobile OTP** (India) | `/login/otp` ↔ `POST /api/auth/otp/request` + `/verify` | MSG91 sends 6-digit code → cookie |
| 3 | **Google SSO** | Button on `/login` ↔ `/api/oauth/google/start` → callback | OAuth2 → match user → cookie |
| 4 | **Magic link via team invite** | `/invite/[token]` ↔ `POST /api/invite/[token]/accept` | UserInvite token consumed |

### Signup paths (3)

| # | Path | Where |
|---|---|---|
| 1 | **Email + password signup** with business type pick | `/signup` ↔ `POST /api/auth/signup` |
| 2 | **Google SSO signup** | OAuth callback redirects to `/signup?google=1&email=…` for first-time |
| 3 | **Team invite signup** | `/invite/[token]` → name + password → user added to existing tenant |

### Password & account management

- `POST /api/auth/forgot` — sends reset email (Resend) with `PasswordReset` row
- `POST /api/auth/reset` — consumes token, hashes new pw with bcrypt
- `POST /api/auth/logout` — deletes `hb_session` cookie

### Sessions

- **Storage:** JWT in `hb_session` HttpOnly cookie
- **Library:** `jose` (HS256)
- **Lifetime:** 7 days
- **Payload:** `{ userId, tenantId, roleId, email, iat, exp }`
- **No server-side session table** — pure JWT (this is a known gap)

### Roles & permissions

- **System roles** (seeded per tenant): `Admin`, `Manager`
- **Custom roles:** vendor can create any number via `/app/settings/roles`
- **Permission keys** (30+): each is a string like `contact.view`, `proposal.create`, `invoice.refund`, `team.manage`
- **Storage:** `Role.permissions` = JSON object `{ "contact.view": true, ... }`
- **Check function:** `parsePermissions(json) → Set<string>` then `hasPermission(set, 'perm.key')`

### Team membership

- A User has one `roleId` (their role inside the tenant)
- Optionally part of a `Team` (via `TeamMembership` join table)
- Each Project can have a Team OR specific user assignees
- Cascading team changes to projects via `lib/teams/cascade.ts`

### Compliance: DPDP (India)

- Consent checkbox at signup → `Consent` row written with timestamp + IP + user-agent
- Audit log every write via `AuditLog` model (~30 mutations covered)

### Profile

- `User.fullName`, `email`, `phone`, `avatarUrl`
- Editable via `/app/settings/workspace` (basic profile fields)

### Multi-tenant isolation guarantees

- Every Prisma query filtered by `tenantId` (~250 places)
- DB-level RLS policies on every multi-tenant table (post-push.sql)
- API helpers like `requireApi` resolve `{ user, tenant, role }` from JWT → pass to handlers
- `requireContext()` for server components (similar shape)

---

## 4. Database models

```
Tenant ──┬── User ──── Role
         │      │
         │      ├── TeamMembership ── Team
         │      ├── Consent (DPDP)
         │      ├── OtpChallenge
         │      └── PasswordReset
         │
         ├── UserInvite (pending invites)
         ├── AuditLog (all writes)
         └── Integration scope='user' (per-user OAuth, e.g. Google Calendar)
```

### Key fields

```prisma
model User {
  id          String  @id
  tenantId    String
  email       String  @unique
  passwordHash String?      // null for SSO-only users
  googleSub   String? @unique  // Google OAuth identity
  phone       String?
  fullName    String
  roleId      String
  lastLoginAt DateTime?
  twoFactorSecret String?    // ⚠ scaffolded, NOT enforced anywhere
  suspendedAt DateTime?      // ⚠ field exists, no kill check (A16)
  // ... profile fields
}

model Role {
  id          String  @id
  tenantId    String
  name        String
  permissions Json    // { "key": true, ... }
  isSystem    Boolean // true for Admin/Manager — non-editable
}

model UserInvite {
  id        String  @id
  tenantId  String
  email     String
  token     String  @unique
  roleId    String
  teamId    String?
  expiresAt DateTime
  acceptedAt DateTime?
}

model Consent {
  id        String
  userId    String
  type      String  // 'dpdp_terms' | 'dpdp_marketing'
  acceptedAt DateTime
  ipAddress String?
  userAgent String?
}

model PasswordReset {
  token     String  @unique
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
}

model OtpChallenge {
  phone     String
  code      String   // bcrypted
  expiresAt DateTime
  attempts  Int
  verifiedAt DateTime?
}

model AuditLog {
  tenantId  String
  userId    String?
  action    String  // 'proposal.update'
  entity    String  // 'Proposal'
  entityId  String
  diff      Json?
  at        DateTime
}

model PlatformAdmin {
  id           String   @id
  email        String   @unique
  passwordHash String
  fullName     String
  role         String   // 'super_admin' | 'support'
  lastLoginAt  DateTime?
}
```

---

## 5. Authentication flows

### Flow 1 · Email + password signup

```
User on /signup
   │  fills email, password, fullName, businessType, dpdpConsent
   ▼
POST /api/auth/signup
   │  rate-limit by IP (5/min)
   │  bcrypt hash password
   │
   ├──► provisionTenant():
   │      ├── Create Tenant (slug = slugify(name))
   │      ├── Create default Pipeline + Stages
   │      ├── Create Admin Role (all permissions)
   │      ├── Create Owner User (roleId = Admin)
   │      ├── Seed BusinessType templates
   │      ├── Seed sample Contact "Priya & Arjun"
   │      ├── Create ProposalTemplate (per business type)
   │      ├── Create TenantAIConfig with default tone
   │      └── Create default scheduling availability
   │
   ├──► Write Consent row (dpdp_terms)
   ├──► Write AuditLog (tenant.created)
   │
   ▼
issueSession({ userId, tenantId, roleId, email })
   │  signs JWT (7-day exp)
   │  sets hb_session cookie (HttpOnly, Secure, SameSite=Lax)
   │
   ▼
Returns 201 → client navigates to /app/setup
```

### Flow 2 · Email + password login

```
User on /login
   │  fills email + password
   ▼
POST /api/auth/login
   │  ⚠ rate-limit by IP only (NOT by email) — GAP A3
   │
   ├──► Look up User by lowercase email
   │       └── If not found → 401 "Invalid credentials"
   │
   ├──► bcrypt.compare(password, user.passwordHash)
   │       └── If fail → 401 "Invalid credentials"
   │
   ├──► Update user.lastLoginAt
   ├──► issueSession(...)
   │
   ▼
200 → client router.push('/app/setup')
```

### Flow 3 · Mobile OTP

```
Step 1: Request
─────────────────
User enters phone
   ▼
POST /api/auth/otp/request { phone }
   │  generate 6-digit code
   │  bcrypt hash it
   │  upsert OtpChallenge row (expiresAt = now + 5min)
   │  IF MSG91_AUTH_KEY → send SMS via MSG91
   │  ELSE (dev fallback) → log code to console
   │
   ▼
200 OK

Step 2: Verify
─────────────────
User enters code
   ▼
POST /api/auth/otp/verify { phone, code }
   │  Find OtpChallenge by phone where verifiedAt IS NULL
   │  bcrypt.compare(code, challenge.code)
   │  If match → mark verifiedAt = now
   │
   ├──► Look up User by phone
   │       ├── If exists → log in
   │       └── If not → 404 (signup required separately)
   │
   ├──► issueSession(...)
   ▼
200 OK → client router.push('/app/setup')
```

### Flow 4 · Google OAuth SSO

```
User clicks "Login with Google" on /login
   ▼
GET /api/oauth/google/start
   │  generate state nonce
   │  set g_oauth_state cookie (10 min)
   │  redirect to accounts.google.com with scope=openid email profile
   │
User consents at Google
   │
   ▼
GET /api/oauth/google/callback?code=...&state=...
   │  verify state cookie matches
   │  exchange code for access_token at oauth2.googleapis.com/token
   │  fetch userinfo → { sub, email, name }
   │
   ├──► Match user by googleSub
   │      └── if not found → Match by email + link googleSub
   │
   ├──► If still no user → redirect /signup?email=&google=1&sub=…
   │      (user finishes signup with prefill)
   │
   ├──► If found → update lastLoginAt + issueSession()
   ▼
Redirect to /app/setup
```

### Flow 5 · Team invite acceptance

```
Vendor on /app/settings/team clicks "Invite member"
   │  fills email, role, optional team
   ▼
POST /api/teams/[id]/members/invite
   │  generate token (nanoid)
   │  create UserInvite (expiresAt = +7 days)
   │  Resend email with link /invite/{token}
   │
─────────────────────
Invitee clicks email link
   ▼
GET /invite/[token]
   │  load UserInvite
   │  show form: fullName + password
   ▼
POST /api/invite/[token]/accept
   │  bcrypt hash password
   │  create User (tenantId from invite, roleId from invite)
   │  if invite.teamId → create TeamMembership
   │  mark UserInvite.acceptedAt
   │  issueSession()
   ▼
200 → client router.push('/app/setup')
```

### Flow 6 · Password reset

```
User on /forgot enters email
   ▼
POST /api/auth/forgot
   │  Find User by email (200 even if not found — no enumeration)
   │  Generate token (nanoid)
   │  Create PasswordReset row (expiresAt = +1 hour)
   │  Resend email with link /reset?token=…
   ▼
User clicks link → /reset
   │  fills new password
   ▼
POST /api/auth/reset
   │  Find PasswordReset by token, expiresAt > now, usedAt NULL
   │  bcrypt hash new password
   │  Update User.passwordHash
   │  Mark PasswordReset.usedAt = now
   ▼
200 → client navigates to /login
```

---

## 6. Authorization layers

Every request passes through up to **4 layers** before reaching data. Any layer can reject.

```
  Request: GET /api/projects/cmpv...
     │
     ▼
  ┌─────────────────────────────────────────────────┐
  │ LAYER 1: ROUTE GUARD                            │
  │  requireApi('contact.view')  for API           │
  │  requireContext() for server components         │
  │  → 401 if no session                            │
  │  → 403 if missing permission                    │
  └─────────────────────────────────────────────────┘
     │
     ▼
  ┌─────────────────────────────────────────────────┐
  │ LAYER 2: SCOPE FILTER                           │
  │  visibleProjectScope({userId, tenantId, perms})│
  │  returns: 'ALL' OR { type:'IDS', ids:[...] }   │
  │  projectInScope(scope, projectId) → bool        │
  │  → 404 (not 403, to avoid leaking existence)    │
  └─────────────────────────────────────────────────┘
     │
     ▼
  ┌─────────────────────────────────────────────────┐
  │ LAYER 3: APP-LEVEL TENANT FILTER                │
  │  prisma.project.findFirst({                     │
  │    where: { id, tenantId: auth.tenant.id }      │
  │  })                                             │
  │  Every query has tenantId in WHERE.             │
  └─────────────────────────────────────────────────┘
     │
     ▼
  ┌─────────────────────────────────────────────────┐
  │ LAYER 4: DB ROW-LEVEL SECURITY (RLS)            │
  │  prisma/post-push.sql creates policies on       │
  │  every multi-tenant table:                      │
  │    CREATE POLICY "Project_tenant"               │
  │    ON "Project"                                 │
  │    FOR ALL                                      │
  │    USING (tenantId = current_setting(           │
  │            'app.tenant_id'                      │
  │           )::text);                             │
  │                                                 │
  │  Even if app forgets to filter, DB rejects.     │
  └─────────────────────────────────────────────────┘
     │
     ▼
  Row returned ✓
```

### Same flow for each user type

| User type | Layer 1 | Layer 2 | Layer 3 | Layer 4 |
|---|---|---|---|---|
| **Platform Admin** | `requirePlatformAdmin` | — | NO tenant filter (sees all) | NO RLS bypass needed (admin role on DB) |
| **Owner** | `requireApi(perm)` | `visibleProjectScope` → ALL | every query has tenantId | RLS policy matches |
| **Staff** | `requireApi(perm)` | scoped to assigned projects | every query has tenantId | RLS policy matches |
| **Collaborator** | special: `loadCollaboratorByToken` | one project only | implicit (token has projectId) | RLS matches |
| **Client** | special: `loadByShareToken` | one proposal/invoice only | implicit (token resolves tenantId) | RLS matches |

---

## 7. Permission matrix

Grouped by area:

| Area | Keys |
|---|---|
| **Contacts** | `contact.view` · `contact.edit` · `contact.delete` |
| **Leads** | `lead.view` · `lead.edit` · `lead.delete` · `lead.assign` |
| **Proposals** | `proposal.view` · `proposal.create` · `proposal.send` · `proposal.delete` |
| **Invoices** | `invoice.view` · `invoice.create` · `invoice.refund` · `invoice.delete` |
| **Projects** | `project.viewAll` · `project.create` · `project.edit` · `project.delete` |
| **Tasks** | `task.view` · `task.create` · `task.edit` · `task.delete` · `task.assign` |
| **Files** | `file.view` · `file.upload` · `file.delete` |
| **Calendar** | `calendar.view` · `calendar.create` |
| **Reports** | `report.view` |
| **Settings** | `settings.view` · `settings.edit` |
| **Team** | `team.view` · `team.manage` · `role.manage` · `member.invite` |
| **Billing** | `billing.view` · `billing.edit` |

### Default role configurations

- **Admin** → all keys = true
- **Manager** → everything except `team.manage`, `role.manage`, `billing.edit`
- **Custom roles** → vendor toggles each key in `/app/settings/roles`

---

## 8. Data access by user type

```
┌──────────────────────────────────────────────────────────────────────┐
│ DATA ACCESS MATRIX                                                   │
├────────────────────┬───────────┬─────────┬────────────┬──────────────┤
│ Resource           │ Platform  │ Owner   │ Staff      │ Collaborator │
│                    │ Admin     │ Admin   │ (Manager)  │              │
├────────────────────┼───────────┼─────────┼────────────┼──────────────┤
│ All tenants        │   ✅     │   ❌    │    ❌      │     ❌       │
│ Own tenant         │   ✅     │   ✅    │    ✅      │     ❌       │
│ Members + roles    │   ✅     │   ✅    │   view     │     ❌       │
│ Create/delete role │   ✅     │   ✅    │    ❌      │     ❌       │
│ All contacts       │   ✅     │   ✅    │    ✅      │     ❌       │
│ All leads          │   ✅     │   ✅    │    ✅      │     ❌       │
│ All projects       │   ✅     │   ✅    │   *scope   │  only        │
│                    │           │         │            │  assigned    │
│ Project financials │   ✅     │   ✅    │   ✅       │     ❌       │
│ Files (tenant)     │   ✅     │   ✅    │   ✅       │     ❌       │
│ Files (shared)     │   ✅     │   ✅    │   ✅       │  if shared   │
│ Integrations       │   ✅     │   ✅    │  view only │     ❌       │
│ Billing / sub      │   ✅     │   ✅    │    ❌      │     ❌       │
│ Audit log          │  all      │ own     │   own      │     ❌       │
│ Suspend tenant     │   ✅     │   ❌    │    ❌      │     ❌       │
│ Suspend user       │   ✅     │   ✅    │    ❌      │     ❌       │
├────────────────────┴───────────┴─────────┴────────────┴──────────────┤
│ * "scope" = visibleProjectScope() limits Manager to projects they're │
│   members of (unless they have project.viewAll permission)           │
└──────────────────────────────────────────────────────────────────────┘
```

### Client (no login) — token-based access

| Resource | Allowed via |
|---|---|
| View a proposal | `/p/[shareToken]` |
| Sign the contract | `/p/[token]` → DocuSign |
| Pay an invoice | `/i/[token]` → Razorpay |
| Submit a lead form | `/f/[slug]` (public) |
| Book a meeting | `/book/[slug]` (public) |
| Leave a review | `/r/[token]` |
| Download signed agreement | `/api/share/[token]/documents/[id]` |
| See another vendor's proposal | ❌ (404 unless token) |
| See vendor's other clients | ❌ |

### Owner vs Staff — what actually differs

```
Both log in the same way.
Both land on /app/setup.
Both see the same sidebar items.
The DIFFERENCE is what they can SEE and DO inside each page.
Driven entirely by Role.permissions JSON.

EXAMPLE: Project workspace /app/projects/[id]

Owner (Admin role):              Staff (Manager role):
  Overview tab          ✅          Overview tab          ✅
  Tasks tab             ✅          Tasks tab             ✅ (self-assign only)
  Files tab             ✅          Files tab             ✅
  Financials tab        ✅          Financials tab        ✅ view, ❌ refund
  Messages tab          ✅          Messages tab          ✅
  Team tab              ✅          Team tab              ❌ view only
  Convert to project    ✅          Convert to project    ✅ if project.create
  Delete project        ✅          Delete project        ❌ unless project.delete
```

---

## 9. Where data is allowed to flow

```
                    ┌─────────────────────────────────┐
                    │  PLATFORM (Avantus internals)   │
                    │  - PlatformAdmin (you)          │
                    │  - All Tenants                  │
                    │  - All AuditLog                 │
                    │  - All PaymentWebhook           │
                    └─────────────────────────────────┘
                                  ▲
                                  │ READ ONLY (no writes
                                  │ except suspend, billing)
                                  │
                ┌─────────────────┴────────────────┐
                │                                  │
                ▼                                  ▼
        ┌──────────────┐                  ┌──────────────┐
        │ TENANT A     │                  │ TENANT B     │
        │ (wedding co) │  STRONG ISOLATION│ (photog co)  │
        │              │  via RLS         │              │
        │  Contacts    │  ─────────────── │  Contacts    │
        │  Leads       │      ❌ NO       │  Leads       │
        │  Proposals   │   CROSS-TENANT   │  Proposals   │
        │  Projects    │     READS        │  Projects    │
        │  Files       │                  │  Files       │
        │  Integrations│                  │  Integrations│
        └──────┬───────┘                  └──────┬───────┘
               │                                 │
               │ scoped further by Role          │
               ▼                                 ▼
        ┌──────────────┐                  ┌──────────────┐
        │ Owner sees   │                  │ Owner sees   │
        │ everything   │                  │ everything   │
        │              │                  │              │
        │ Manager sees │                  │ Manager sees │
        │ assigned only│                  │ assigned only│
        │              │                  │              │
        │ Collaborator │                  │ Collaborator │
        │ scoped to    │                  │ scoped to    │
        │ one project  │                  │ one project  │
        └──────────────┘                  └──────────────┘
```

---

## 10. End-to-end user journey

```
Day 0 — Stranger to Client
─────────────────────────────────────────────────────────────
[Stranger]
   │ /f/discovery-call
   ▼
[Lead form submit]
   │ → creates Contact, Lead, drips, optional book_meeting
   ▼
[Contact in vendor DB]
   │ vendor reviews, generates proposal
   ▼
[Lead → Proposal]
   │ vendor sends /p/[token]
   ▼
[Client (token-only auth)]
   │ accepts + signs + pays deposit
   ▼
[Project created]
   │ ensureProjectForLead()
   │ task templates seeded
   ▼

Day 30 — Project delivery
─────────────────────────────────────────────────────────────
[Vendor Owner]
   │ /app/projects/123 → Team tab → adds freelance photographer
   ▼
[Collaborator]
   │ /c/[token] sees only their assigned tasks + files
   ▼
[Tasks completed]
   │ Vendor sends final invoice via /i/[token]
   ▼
[Client pays balance]
   │ Project status → COMPLETED
   ▼
[Review request /r/[token]]
   ▼
[5-star review collected]


Day 31+ — Owner runs the business
─────────────────────────────────────────────────────────────
[Vendor Owner]
   │ /app/workload → team utilization
   │ /app/reports  → revenue, conversion, source mix
   │ /app/settings → adjusts proposal template
   ▼

Always behind the scenes:
─────────────────────────────────────────────────────────────
[Platform Admin]
   │ /admin/tenants → monitor all vendors
   │ /admin/billing → check subscriptions
   │ /admin/audit  → support investigation
   ▼
```

---

## 11. Settings UIs

| Page | Purpose |
|---|---|
| `/app/settings/team` | Invite members, set role, suspend |
| `/app/settings/teams` | Create teams, set leads, move people |
| `/app/settings/roles` | Custom roles with per-permission toggles |
| `/app/settings/security` | Sessions list (planned), 2FA scaffold |
| `/app/settings/workspace` | Profile + tenant brand + locale |

---

## 12. What's working well

1. **JWT cookie + middleware** — clean separation, fast (~5ms per request)
2. **Triple-layer authz** — route guard + scope + RLS means even if app code forgets, DB rejects
3. **Per-tenant Role table** with editable permission JSON — flexible, no schema changes for new keys
4. **provisionTenant()** is idempotent and seeds a complete working workspace
5. **Audit log on writes** — exists for compliance reviews
6. **DPDP consent** captured + stored
7. **OAuth state cookie** prevents CSRF on the SSO callback
8. **Email enumeration protection** in `/forgot` (200 regardless)
9. **bcrypt** with reasonable cost factor
10. **Magic-link invite** flow well-built; UserInvite table tracks expiry + acceptance

---

## 13. Gaps & risks

| ID | Issue | Severity | Status |
|---|---|---|---|
| A1 | No 2FA enforcement option for owner accounts | 🟠 High | ⬜ |
| A2 | No session revocation — pure JWT, valid for 7 days even after password change | 🟠 High | ⬜ |
| A3 | Login throttling per IP only — credential stuffing risk | 🟠 High | ⬜ |
| A4 | Password policy — no complexity check, no breached-password check | 🟡 Medium | ⬜ |
| A5 | OTP — no exponential backoff after failures | 🟡 Medium | ⬜ |
| A6 | No account lockout after repeated failed logins | 🟡 Medium | ⬜ |
| A7 | JWT_SECRET rotation undocumented | 🟡 Medium | ⬜ |
| A8 | Email change flow doesn't re-verify | 🟡 Medium | ⬜ |
| A9 | **No automated tests for permission matrix** | 🔴 Critical | ⬜ |
| A10 | No CAPTCHA on signup — bot signups possible | 🟡 Medium | ⬜ |
| A11 | Reset token format short — should be 32+ bytes | 🟡 Medium | ⬜ |
| A12 | OTP not cleared after failed verification | 🟡 Medium | ⬜ |
| A13 | No session listing UI in `/app/settings/security` | 🟡 Medium | ⬜ |
| A14 | No "impersonate user" for support | 🟢 Low | ⬜ |
| A15 | No SAML / enterprise SSO | 🟢 Low | ⬜ |
| A16 | **Suspended users — field exists, no enforcement check** | 🟠 High | ⬜ |
| A17 | Role delete — what happens to users on it? | 🟡 Medium | ⬜ |
| A18 | No "force password change on next login" flag | 🟡 Medium | ⬜ |
| A19 | Platform admin login URL undocumented in UI | 🟡 Medium | ⬜ |
| A20 | Platform admin actions not logged separately from tenant audit | 🟡 Medium | ⬜ |
| A21 | Client portal share tokens never expire | 🟠 High | ⬜ (also C3) |
| A22 | Collaborator share tokens never expire | 🟠 High | ⬜ (also C3) |

---

## 14. Production-grade bar

### Authentication
- [ ] **TOTP 2FA**: setup wizard at `/app/settings/security`, QR code, enforce on next login, recovery codes
- [ ] **Login throttling per email + IP**: `loginFail:{email}` counter, 5/15 min lockout
- [ ] **Account lockout**: after 10 failed attempts in 1h, lock for 1h + send email
- [ ] **Password complexity**: min 10 chars, one number, one letter
- [ ] **Breached-password check**: haveibeenpwned API on signup + reset
- [ ] **OTP backoff**: exponential per phone (5 attempts then 5min, 10 then 1h)
- [ ] **Email change re-verify**: send verification link to new email
- [ ] **Reset tokens**: 32+ byte hex, single-use, 1h expiry (already)
- [ ] **Suspended user check**: deny `issueSession` if `suspendedAt` set
- [ ] **CAPTCHA on signup** (Vercel BotID once client component wired)

### Session management
- [ ] **Session table** (`UserSession`): id, userId, deviceLabel, ip, userAgent, issuedAt, lastUsedAt, revokedAt
- [ ] **JWT includes session ID** so we can lookup + revoke
- [ ] **Settings → Security shows** active sessions with revoke button
- [ ] **"Log out all devices"** button
- [ ] **Password change** revokes all sessions
- [ ] **JWT_SECRET versioning** (`JWT_SECRET_v1`, `JWT_SECRET_v2`) so rotation doesn't kick everyone out

### Authorization
- [ ] **Permission test matrix**: automated test for every (role × permission × route) combo
- [ ] **Suspended user is a kill check** before `requireApi` returns
- [ ] **Role delete protection**: warn if users still on the role, offer reassign

### Compliance
- [ ] **Audit log retention** policy: 12 months hot, archive to R2 after
- [ ] **DPDP erasure**: tenant deletion (M2) cascades to delete all user PII
- [ ] **Audit log includes**: who, what, before, after, IP, when
- [ ] **Platform admin actions in separate `PlatformAuditLog` model**

### Observability
- [ ] **Sentry on every auth failure** (login fail, OTP fail, OAuth fail)
- [ ] **Per-tenant auth event stream** so vendor can see "5 failed logins from IP X"

### Documentation
- [ ] **RUNBOOK section** for: rotating JWT_SECRET, deleting a tenant, restoring from backup, suspending an account, creating a platform admin
- [ ] **CLI script** `scripts/create-platform-admin.ts`

---

## 15. File map

```
src/lib/auth.ts            — issueSession, verifyPassword, signJWT
src/lib/session.ts         — requireContext (server components)
src/lib/api.ts             — requireApi, enforceRateLimit
src/lib/db-rls.ts          — RLS policy helpers
src/lib/provision.ts       — provisionTenant() — bootstraps everything
src/lib/audit.ts           — auditLog() helper
src/lib/teams/cascade.ts   — team-membership cascading
src/lib/platform-auth.ts   — requirePlatformAdmin

src/app/(auth)/login/page.tsx           — email/pw login
src/app/(auth)/login/otp/page.tsx       — mobile OTP
src/app/(auth)/signup/page.tsx          — signup page
src/app/(auth)/signup/SignupForm.tsx    — signup form
src/app/(auth)/forgot/page.tsx          — request reset
src/app/(auth)/reset/page.tsx           — perform reset
src/app/(auth)/invite/[token]/page.tsx  — accept invite

src/app/api/auth/signup/route.ts
src/app/api/auth/login/route.ts
src/app/api/auth/logout/route.ts
src/app/api/auth/forgot/route.ts
src/app/api/auth/reset/route.ts
src/app/api/auth/otp/request/route.ts
src/app/api/auth/otp/verify/route.ts
src/app/api/oauth/google/start/route.ts
src/app/api/oauth/google/callback/route.ts
src/app/api/oauth/[provider]/start/route.ts        — generic OAuth (gmail, calendar)
src/app/api/oauth/[provider]/callback/route.ts
src/app/api/invite/[token]/accept/route.ts

src/app/api/roles/route.ts              — role CRUD
src/app/api/teams/route.ts              — team CRUD
src/app/api/teams/[id]/members/route.ts — member management
src/app/api/2fa/*                       — 2FA scaffold (incomplete)

src/app/admin/                          — platform admin pages
src/app/api/admin/                      — platform admin APIs

src/app/app/settings/team/page.tsx      — members UI
src/app/app/settings/teams/page.tsx     — teams UI
src/app/app/settings/roles/page.tsx     — roles UI
src/app/app/settings/security/page.tsx  — security settings (incomplete)
```

---

## 16. Test-it-yourself checklist

| # | Test | Expected |
|---|---|---|
| 1 | `/signup` with new email | New tenant created, lands on `/app/setup` |
| 2 | Logout, `/login` with same | Back on `/app/setup` |
| 3 | `/forgot` with that email | Email arrives via Resend (or console log) |
| 4 | Use reset link | Can set new password, logs in |
| 5 | Old password | 401 "Invalid credentials" |
| 6 | `/login/otp` with phone | Code arrives via MSG91 (or console) |
| 7 | Wrong OTP code | Error, no login |
| 8 | Right code | Logs in |
| 9 | Google OAuth on existing email | Links googleSub, logs in |
| 10 | Google OAuth on new email | Bounces to `/signup?email=...&google=1` |
| 11 | Invite a member from `/app/settings/team` | Email arrives, link works |
| 12 | Invitee completes signup | Lands in same tenant with chosen role |
| 13 | Manager role tries to delete a Contact | 403 if `contact.delete` not granted |
| 14 | Custom role with only `contact.view` | Can see contacts, cannot create/edit |
| 15 | After password change | Old JWT still works for 7 days **(gap A2)** |
| 16 | After 6 failed logins same IP | Rate-limited (works) |
| 17 | After 100 failed logins distributing IPs | Should lockout email **(gap A3)** |
| 18 | Setting 2FA | UI doesn't exist yet **(gap A1)** |
| 19 | Suspending a user | Suspended user can still log in **(gap A16)** |
| 20 | `/admin/login` | Platform admin login page |

---

## 17. Suggested execution order

If we tackle M1 as a standalone sprint:

| Day | Task | Outcome |
|:---:|---|---|
| 1 | **A9** Permission test matrix (Vitest) — covers existing routes | Confidence we can refactor without breaking authz |
| 2 | **A2** Session table + revoke + "log out all devices" | Real session control |
| 3 | **A3 + A6** Per-email throttling + account lockout | Stops credential stuffing |
| 4 | **A1** TOTP 2FA setup + enforce on login | Owner accounts safer |
| 5 | **A16 + A18** Suspended user enforcement + force-password-change flag | Vendor can deactivate departing employees |
| 6 | **A4 + A11** Password complexity + breached-password check + token strength | Baseline hygiene |
| 7 | **A8** Email change re-verify + RUNBOOK for JWT_SECRET rotation | Account safety + ops docs |
| 7b | **A19** Build `scripts/create-platform-admin.ts` + document `/admin/login` in RUNBOOK | Platform admin self-service |

**5-7 working days for full M1 production-grade.**

---

## 18. Open decisions

| ID | Decision | Options | Status |
|---|---|---|---|
| **M1-D1** | Test infrastructure first? | Vitest + Neon branch + permission matrix → unblocks confident refactoring | ⬜ Open |
| **M1-D2** | 2FA — owner-required or owner-optional? | (a) Required for Admin role · (b) Optional but strongly nudged · (c) Optional only | ⬜ Open |
| **M1-D3** | Session revocation strategy? | (a) Session ID in JWT + DB lookup (~5ms overhead) · (b) Redis denylist for revoked JTIs | ⬜ Open |
| **M1-D4** | Account lockout — soft or hard? | (a) Soft for 1 hour, auto-unlock · (b) Hard until admin unlock | ⬜ Open |
| **M1-D5** | Platform admin bootstrap method | (a) CLI script · (b) one-off SQL · (c) seed file | ⬜ Open |
| **M1-D6** | Share token expiry | (a) Never (current) · (b) Default 90d, vendor extendable · (c) Configurable per template | ⬜ Open (also C3) |

---

## Cross-references

- **MODULES.md** — top-level audit + Phase A/B/C/D plan
- **RUNBOOK.md** — operational procedures (TBD: JWT rotation, tenant delete, admin create)
- **SECRETS.md** — env var inventory
- **CLAUDE.md** / **AGENTS.md** — repo conventions for AI assistants

---

## Change log

| Date | Change |
|---|---|
| 2026-06-04 | Document created. Captured full M1 inventory, flows, gaps, production-grade bar, and execution plan. |
