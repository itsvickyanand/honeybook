# Production Runbook

## First-time deploy
1. **Postgres** — managed instance with pgvector extension enabled. Min: 4 vCPU, 8 GB, 100 GB SSD, automated daily backups, point-in-time recovery on.
2. **Redis × 2** — separate instances for cache vs queue (per BRD Addendum Fix 17). Both with HA (managed multi-AZ).
3. **Object storage** — S3 bucket `honeybook-prod` with `BlockPublicAccess=true`. Lifecycle rule: `tenants/.../files/*` to Standard-IA after 30 days.
4. **App roles**:
   - `honeybook` — Postgres owner (migrations only)
   - `honeybook_app` — app runtime (no BYPASSRLS; subject to RLS)
5. **Migrations**:
   ```
   prisma db push
   psql -f prisma/post-push.sql
   psql -f prisma/rls.sql
   psql -f prisma/partitioning.sql   # if not already partitioned
   ```
6. **DATABASE_URL** in app env points at PgBouncer (port 6432), not Postgres directly. Use `pgbouncer=true` in the Prisma URL.
7. **API + Worker tiers** run on separate processes. `npm run start` for API, `npm run start:worker` for worker.

## Scaling thresholds
| Metric | Action |
|---|---|
| API p95 latency > 400ms sustained | Add API replicas |
| Worker queue depth > 1k on P0 | Add worker replicas |
| Postgres CPU > 70% sustained | Vertical scale OR add read replica |
| Tenants > 5,000 OR MENA > 100 | Activate MENA region (see Region Activation) |
| Active row count > 50M on partitioned tables | Confirm pg_partman is rotating |

## Region activation (MENA)
Per BRD Addendum v1.2 Fix 14, the region router was designed day-one. To go live in MENA:
1. Provision a Postgres + Redis stack in `me-south-1` (Bahrain).
2. Set `DATABASE_URL_MENA` and `REDIS_URL_MENA` in app env.
3. Run the migration set on the new region.
4. Migrate MENA tenants: `UPDATE "Tenant" SET region='MENA' WHERE …` then dump+restore their rows.
5. Restart API + workers.
6. Verify by inspecting `prismaForTenant(menaTenantId)` — should route to MENA pool.

## Incident: payment gateway webhook missed
Razorpay re-delivers up to 16 times. If a payment is stuck `PENDING`:
1. Pull the latest `payment_link` status via the [Payment Link API](https://razorpay.com/docs/api/payments/payment-links/fetch-payments/).
2. If captured, manually mark the Payment SUCCESS and enqueue `payment.reconcile`.

## Incident: GST IRN generation failing
1. Check `WebhookEvent` rows from the IRP aggregator — error response gives the exact rejection reason.
2. Common: wrong place-of-supply code, mismatch on HSN, tenant not registered.
3. Fix the underlying invoice or tenant data, then re-enqueue `gst.irn.generate`.

## Incident: tenant data corruption suspected
1. Query `withTenant(tenantId, …)` to confirm RLS is active (try selecting another tenant's row — must return empty).
2. Restore from point-in-time backup.

## Compliance check-ins (quarterly)
- DPDP Act: confirm Indian tenant data is in `ap-south-1`.
- ZATCA Phase 2 (Saudi): for KSA tenants, IRN submission is real-time (not batch).
- PCI: card data never lands on our servers — gateway hosts the form.
