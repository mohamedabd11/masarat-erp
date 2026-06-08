# Masarat ERP — Production Readiness Report
**Date:** 2026-05-29  
**Branch:** `claude/masarat-erp-production-review-0pve0`  
**Scope:** Phases 1–4 complete

---

## Scores by Axis (out of 10)

| Axis | Score | Notes |
|------|-------|-------|
| **TypeScript Correctness** | 10/10 | Zero `tsc --noEmit` errors across all packages. `"target": "ES2020"` added; all Drizzle 0.31.4 table configs converted to named-object syntax. |
| **Security** | 9/10 | CSP + HSTS + X-Frame-Options in next.config.mjs; `SUPER_ADMIN_EMAIL` server-only; Firebase token verification on all admin routes; `ADMIN_DATABASE_URL` with BYPASSRLS; SQL injection prevented via parameterized queries / `sql` tagged templates. Minus 1: ZATCA private key handling not yet tested end-to-end in production. |
| **Data Integrity** | 9/10 | All monetary values in halalas (BIGINT, no floats); double-entry enforced by check constraint; tenant isolation enforced at the application layer via consistent `agencyId` filtering on every query (RLS is scaffolded as a defense-in-depth layer but not yet enabled — see Database Schema row); FK-safe delete order in wipe-agency; append-only enforced for posted journal entries. Minus 1: `supplier_payments` table referenced in wipe-agency but not in current schema exports — needs verification. |
| **Observability** | 8/10 | Structured JSON logger (`logger.ts`) with child context; Sentry on client/server/edge with request body redaction; `beforeSend` strips financial data. Minus 2: No alerting rules configured; no dashboard/runbook yet. |
| **Test Coverage** | 7/10 | 19 accounting edge-case tests (BigInt safety, VAT, rounding); 7 `skipIf`-guarded integration suites (credit-note, payroll, accounting-periods, bank-reconcile, invoice-journal, supplier-payments, auth-register) that run against `DATABASE_URL_TEST` when available. Minus 3: No E2E tests; no invoice/payment server-action tests; no RLS-specific tests exist (RLS is scaffolded but not enabled — see Database Schema row). |
| **Database Schema** | 9/10 | Full multi-tenant schema — 41 tables carry `agency_id`, isolation enforced at the application layer (see Data Integrity); RLS policies are scaffolded for all 41 in `0016_rls_agency_isolation.sql` as a defense-in-depth layer (bypass-policy design verified to be a no-op for the current service role) but **not yet enabled** in production — see roadmap item below; all 27 tables converted; migrations tracked via Drizzle Kit. Minus 1: `service_types` table referenced in wipe-agency and schema but not exported from `index.ts` — confirm export. |
| **API Routes** | 9/10 | All admin routes migrated to PostgreSQL (no Firestore); cron job for subscription expiry; idempotency keys on invoices/payments. Minus 1: No rate-limiting middleware on admin routes yet (Upstash Redis vars present but not wired). |
| **Performance** | 7/10 | Neon serverless driver (connection pooling); `tracesSampleRate: 0.05` in production. Minus 3: No query analysis done; no CDN/edge caching strategy; cron job does full table scan without partial index. |
| **Developer Experience** | 9/10 | Monorepo (pnpm workspaces); `.env.example` complete; `ADMIN_DATABASE_URL` documented. Minus 1: No `docker-compose` for local Postgres + Firebase Emulator. |
| **Deployment Readiness** | 8/10 | `ignoreBuildErrors` removed; Sentry source maps wired; Next.js instrumentation hook in place. Minus 2: No CI pipeline file (GitHub Actions) and no Vercel project config committed. |

**Overall Average: 8.5 / 10**

---

## Remaining Pre-Launch Checklist

### Blocking (must fix before production)
- [ ] Set `ADMIN_DATABASE_URL` in Vercel to a connection string with `BYPASSRLS` role (or confirm Neon owner role suffices)
- [ ] Store ZATCA private key **only** in Vercel encrypted secrets, not `.env` / Git
- [x] ~~Verify `supplier_payments` and `service_types` tables exist~~ — confirmed: both defined and exported via wildcard in schema/index.ts
- [x] ~~Add `CRON_SECRET` check~~ — fixed: all 3 cron routes now use `GET` + `Authorization: Bearer ${CRON_SECRET}` (Vercel standard)

### High Priority
- [ ] Wire Upstash Redis rate-limiting on `/api/admin/*` routes (vars already in `.env.example`)
- [ ] Add GitHub Actions CI: `pnpm install → tsc → vitest → build`
- [ ] Create `DATABASE_URL_TEST` Neon branch and wire the 7 existing `skipIf`-guarded integration suites into CI (credit-note, payroll, accounting-periods, bank-reconcile, invoice-journal, supplier-payments, auth-register)
- [ ] **RLS activation roadmap** (policies are scaffolded in `0016_rls_agency_isolation.sql` for all 41 tenant tables but inactive — current isolation is enforced solely at the application layer via `agencyId` filtering, which is sound on its own): (1) introduce a restricted `app_user` DB role without `BYPASSRLS`, (2) wire the existing-but-unused `withAgencyContext()` helper (`src/lib/db-context.ts`) into the request pipeline so `app.current_agency_id` is set per request, (3) apply the migration — its `bypass_for_service_role` policy makes this a verified no-op for the current connection role, so existing behaviour is preserved, (4) switch the app's DB connection to the restricted role and only then drop the bypass policies so `agency_isolation` becomes the active enforcement layer, with RLS tests added before that cutover
- [ ] Review and add partial index on `agencies.subscription_ends_at` for cron query performance

### Nice to Have
- [ ] E2E tests with Playwright for booking + invoice flow
- [ ] `docker-compose.yml` for local development (Postgres + Firebase Emulator)
- [ ] Sentry alerting rules and on-call runbook
- [ ] Vercel Analytics / Speed Insights configuration

---

## Environment Variables Summary

| Variable | Required | Exposure | Purpose |
|----------|----------|----------|---------|
| `DATABASE_URL` | ✅ | Server only | Primary DB connection |
| `ADMIN_DATABASE_URL` | ✅ prod | Server only | Admin ops with BYPASSRLS |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✅ | Server only | Firebase Admin SDK |
| `SUPER_ADMIN_EMAIL` | ✅ | Server only | Super-admin gate |
| `NEXT_PUBLIC_FIREBASE_*` | ✅ | Client + Server | Firebase Auth SDK |
| `SENTRY_DSN` | prod | Server only | Error tracking (server) |
| `NEXT_PUBLIC_SENTRY_DSN` | prod | Client | Error tracking (client) |
| `ZATCA_ENVIRONMENT` | ✅ | Server only | simulation \| production |
| `BLOB_READ_WRITE_TOKEN` | ✅ prod | Server only | Invoice PDF/XML storage |
| `DATABASE_URL_TEST` | CI only | Server only | `skipIf`-guarded integration test suites |
| `CRON_SECRET` | ✅ prod | Server only | Vercel cron job auth (`openssl rand -hex 32`) |
| `ZATCA_API_SECRET` | ✅ prod | Server only | ZATCA API Basic auth secret |
| `UPSTASH_REDIS_REST_URL/TOKEN` | optional | Server only | Rate limiting |
