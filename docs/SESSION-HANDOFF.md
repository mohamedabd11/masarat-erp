# Session Handoff — Audit Remediation (2026-06-11)

> **For the next Claude session (any account):** read this file first, then
> `docs/REMAINING-AUDIT-REMEDIATION.md`. This file says what is DONE and what is
> LEFT; the other file has the per-item detail for what is left.

## Where we stopped

- **Branch:** `claude/masarat-audit-remediation-chkt5v` → merged into the default
  dev branch `claude/masarat-travel-erp-design-NO1ST` via **PR #19**.
- **State:** all CI green. The full test suite (unit **+** integration) runs
  against a real PostgreSQL service in CI — **460 tests pass, 0 skipped**.
- **Latest preview deploy (Vercel):**
  `https://masarat-erp-git-claude-masarat-audit-re-ee1271-masarat-projects.vercel.app`
  (preview of this branch; production deploy is a separate Vercel step).
- **Money model:** integer halalas (1 SAR = 100). Accounting core in
  `packages/accounting`; GL codes in `apps/web/src/lib/gl-accounts.ts`.

## What was completed in this PR

**CRITICAL (accounting logic) — all done**
- CRIT-10 — refund GL rewritten to reverse the original invoice's `journal_lines`
  pro-rated (new pure `apps/web/src/lib/refund-journal.ts` + unit + integration
  tests): mixed agent+principal revenue, real COGS/AP, deferred 3201, Bank-vs-AR.
- CRIT-8 / HIGH-8 / CRIT-9 — VAT-return Output VAT from GL 2200; AR aging
  reconciled to 1120; AP aging reconciled to 2000 + `suppliers.balanceHalalas`
  maintained at invoice time.

**CRITICAL (security)**
- CRIT-6 (option b) — app-layer tenant-isolation guard
  (`apps/web/src/__tests__/rls-route-guard.test.ts`).

**HIGH (all done):** HIGH-1, HIGH-2 (atomic idempotency `markIdempotencyComplete`),
HIGH-7 (FX revaluation unique index), HIGH-9 (doc-number uniqueness in boot
migrations), HIGH-11 (ticket orphans → manual review), booking add-line guard,
A4, A5, A6 (`provider_sync_log` table).

**MEDIUM:** MED-1, 2, 3, 5, 6, 10 (rounding account 8399), 11, 13, 14, + B2/B3.
**LOW:** L1, L2, L3, L4.

## What is LEFT (deferred — needs external systems, not scope-cutting)

1. **ZATCA Phase-2** — CRIT-2 (production onboarding route), CRIT-3 (credit/debit
   note submission), CRIT-4 (XML-C14N11 canonicalization), CRIT-5 (9-tag QR),
   MED-7 (per-line VATEX exemption codes), MED-8 (B2B/B2C routing), MED-9
   (idempotent submission keyed on invoice UUID). **Blocked on a ZATCA sandbox /
   Fatoora onboarding.** The whole path is INERT today (gated on
   `agency.zatcaOnboardingStatus !== 'production'`, which CRIT-2 would flip), so
   nothing is broken in the meantime. Do this when a real VAT-registered agency
   onboards, and verify each signed invoice against the ZATCA simulation gateway
   before flipping to production. Relevant files: `packages/zatca/src/signing.ts`,
   `packages/zatca/src/xml-builder.ts`, `apps/web/src/lib/zatca-einvoice.ts`,
   `apps/web/src/app/api/agencies/zatca/*`.

2. **CRIT-6 option (a) — real Postgres RLS** — needs a restricted `app_user`
   Postgres role (no BYPASSRLS) + the app connection pointed at it + dropping the
   `bypass_for_service_role` policies. Infra/env change; option (b) guard is
   already shipped.

3. **Performance B4/B6 — DONE (2026-06-11).** AR-aging is now SQL-aggregated in
   `apps/web/src/lib/ar-aging.ts` (`getAgingReport`): per-customer bucket totals +
   `invoiceCount` via a single `GROUP BY` + conditional `FILTER`, bounded by the
   customer count; invoice-level detail only on a single-customer drill-down; the
   GL-1120 reconciliation is preserved. Verified by a new integration test
   (`ar-aging.integration.test.ts`) against real Postgres. **B5 — DONE:** the
   `reconcile-pending-tickets` cron is wall-clock-bounded (`RUN_BUDGET_MS`,
   `maxDuration=60`) and caches `resolveFlightProviderByCode` per (agency,provider)
   per run. **Still TODO (B4 dashboard tail):** `reports/dashboard` still returns
   the full-year `vatInvoices` list (the VAT-return tab filters it client-side);
   moving that to a server-side date-range aggregation needs a coordinated change
   to the VAT-return tab UI.

4. ~~**Minor:** L7~~ — **DONE (2026-06-11):** supplier-payment account maps are
   centralized in `gl-accounts.ts` (`SUPPLIER_PAYMENT_EXPENSE_ACCOUNT`,
   `PAYMENT_METHOD_ACCOUNT`); create + reverse import them.

## Suggested next session order

1. ZATCA block — only with a sandbox. Start CRIT-4 (canonicalization) since
   CRIT-3/5 depend on a correct signature; verify against the simulation gateway.
2. Then CRIT-2 onboarding (flip to production only after sandbox sign-off).
3. Perf B4/B5/B6 as a measured refactor with the integration DB now in CI.

## How to verify locally

```
pnpm install --frozen-lockfile
pnpm --filter @masarat/accounting test
cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json
cd apps/web && pnpm exec vitest run          # unit only (integration skip w/o DB)
# Integration against a real DB (also runs automatically in CI against an
# ephemeral container, see .github/workflows/integration-tests.yml):
#   start a DISPOSABLE local Postgres and point TEST_DATABASE_URL + DATABASE_URL
#   at IT. NEVER run this against the sandbox's existing DATABASE_URL -- that is
#   the SAME database the deployed app uses, and `push --force` can drop/recreate
#   tables (e.g. invoices), permanently deleting real agency data:
#   pnpm exec drizzle-kit push --force && pnpm exec vitest run
```
CI workflow `.github/workflows/integration-tests.yml` does the DB run on every PR.
