# Masarat ERP — Remaining Pre-Production Remediation (Handoff)

> **Purpose:** Self-contained backlog for a follow-up Claude session. Everything
> needed to continue is here — no re-audit required. Each item has: file, line,
> code, impact, root cause, fix, files to modify, effort, and how to verify.
>
> **Branch:** all already-shipped fixes are merged into the repo default branch
> `claude/masarat-travel-erp-design-NO1ST` (HEAD `e7c619b` at time of writing).
> Continue on that branch (or a new branch off it).
>
> **Stack:** Next.js (`apps/web`) + Drizzle/Postgres (Neon). Money is stored as
> integer **halalas** (1 SAR = 100). Accounting core lives in
> `packages/accounting`; ZATCA in `packages/zatca`. Schema TS in
> `apps/web/src/lib/schema/*`. Runtime idempotent migrations run at boot in
> `apps/web/src/instrumentation.ts`; an alternate provisioner is
> `apps/web/src/app/api/setup-db/route.ts`.
>
> **Test commands:**
> - `pnpm install --frozen-lockfile`
> - `pnpm --filter @masarat/accounting test`
> - `cd apps/web && pnpm exec vitest run`  (388 unit pass, 52 integration skip without DB)
> - `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json`
> - Integration tests (`src/__tests__/integration/*`) and `packages/database`
>   RLS tests need `DATABASE_URL`. **You will need a live Postgres to verify the
>   CRIT-8/9/10 changes and a ZATCA sandbox to verify CRIT-2/3/4/5.**

---

## ✅ ALREADY DONE (do NOT redo) — merged into the default branch

| ID | Fix | Commit |
|----|-----|--------|
| CRIT-1 | Refund-breaking unfiltered unique index replaced with partial `invoices_one_per_booking` on `type IN ('380','388')` | `65cb240` |
| CRIT-7 | Cross-tenant booking write IDOR in `payments/record` (drive update from invoice's own bookingId + agencyId scope) | `b994efa` |
| HIGH-4 | `service-types/[id]` PATCH mass-assignment → column allowlist | `b994efa` |
| HIGH-5 | Unscoped PK-only UPDATEs in `bookings/.../passengers/[passengerId]` and `receipts/[id]/apply` → agencyId-scoped | `b994efa` |
| CRIT-11 | Idempotency on `supplier-payments/create` and `invoices/credit-note` + cumulative credit-note ceiling | `fb5c083` |
| HIGH-6 | Audit-log entry added to `supplier-payments/create` | `fb5c083` |
| HIGH-3 | Atomic ticket-issuance claim (`tickets_active_passenger_uq` + `onConflictDoNothing().returning()`) | `503b4b2` |
| HIGH-10 | `expire-pnrs` cron drains backlog in wall-clock-bounded batches | `503b4b2` |
| MED-4 | `journal_lines.agency_id` FK → `agencies(id)` | `e7c619b` |
| MED-12 | `agency_counters.current_value` widened to bigint | `e7c619b` |
| MED-16/B1 | `pnr_records` indexes (expiry, agency+created, agency+status) | `e7c619b` |

> **Note on idempotency (HIGH-2 caveat):** the in-transaction completion markers
> added to `supplier-payments`/`credit-note` currently use `onConflictDoNothing`,
> which is a no-op because `withIdempotency` pre-inserts a `pending` row. They
> still get the common-case protection (concurrent + retry-within-TTL), but the
> crash-between-commit-and-complete window (HIGH-2) is **not** closed. See HIGH-2.

---

# CRITICAL — block production

## CRIT-2 — ZATCA production onboarding is never implemented (submission is dead code)
- **Files:** `apps/web/src/app/api/agencies/zatca/onboard/route.ts:79` ; `apps/web/src/lib/zatca-einvoice.ts:273`
- **Evidence:**
  - onboard ends at `zatcaOnboardingStatus: 'compliance'` and never advances to `'production'`.
  - `submitInvoiceToZatca` gate: `if (agency.zatcaOnboardingStatus !== 'production') return { submitted:false, status:'skipped', reason:'agency not production-onboarded' };`
  - `requestProductionCsid` / `checkCompliance` exist in `packages/zatca/src/api-client.ts:171,196` but are **never called** anywhere (grep-confirmed). Nothing writes `zatcaProductionCsid`/`zatcaProductionSecret`.
- **Impact:** No invoice is ever cleared (B2B) or reported (B2C). Total ZATCA Phase-2 non-compliance — illegal for a VAT-registered KSA agency. The signed XML / PIH / ICV logic only runs inside this skipped branch.
- **Fix:** Add a route `apps/web/src/app/api/agencies/zatca/production/route.ts` that: (1) builds a sample signed invoice, (2) calls `checkCompliance(complianceCsid, signedInvoice)`, (3) on pass calls `requestProductionCsid(complianceRequestId)`, (4) stores encrypted `zatcaProductionCsid`/`zatcaProductionSecret` (reuse the existing crypto used for compliance CSID), (5) sets `zatcaOnboardingStatus='production'`. Wire a UI step after the compliance step.
- **Files to modify:** new `production/route.ts`; `zatca-einvoice.ts` (no gate change needed once status flips).
- **Effort:** 3–7 days (requires ZATCA sandbox).
- **Verify:** against ZATCA simulation gateway, onboard → production → issue invoice → `zatca_status='cleared'/'reported'`, `zatca_signed_xml` populated.

## CRIT-3 — Credit notes (381) & debit notes (383) never submitted
- **File:** `apps/web/src/lib/zatca-einvoice.ts:261-265` — `if (inv.type !== '388') return { ... reason:'credit/debit note auto-submission not yet supported' }`.
- **Evidence:** `invoices/credit-note/route.ts` and `invoices/debit-note/route.ts` never import/call `submitInvoiceToZatca`.
- **Impact:** Every VAT adjustment (refund/correction) invisible to ZATCA; legally required to be cleared/reported.
- **Fix:** Allow types 381/383 in `submitInvoiceToZatca`; the UBL already emits `BillingReference` from `originalInvoiceUuid`/`originalInvoiceNumber` (`xml-builder.ts:158-164`) — both note routes already populate those. Call submission from both note routes after the DB tx (idempotent, keyed on invoice UUID — see MED-9).
- **Files:** `zatca-einvoice.ts`, `invoices/credit-note/route.ts`, `invoices/debit-note/route.ts`.
- **Effort:** 1–3 days (after CRIT-2).

## CRIT-4 — Signing omits XML-C14N11 canonicalization → ZATCA hash/signature rejection
- **File:** `packages/zatca/src/signing.ts:192-220`
- **Evidence:** `removeSignatureBlock` strips blocks with regex, then `createHash('sha256').update(xmlForHashing,'utf8')` and `signer.update(xmlForHashing,'utf8')`. The XML declares `CanonicalizationMethod Algorithm=".../xml-c14n11"` (`xml-builder.ts:90,103`). The file header itself says acceptance is "NOT VERIFIED" against the gateway.
- **Impact:** ZATCA recomputes the digest over C14N11-canonicalized bytes; attribute/namespace ordering + whitespace differences → digest mismatch → `invoice hash mismatch` rejection. `ds:Reference/DigestValue` won't match.
- **Fix:** Apply true XML-C14N11 canonicalization plus the three declared `ds:Transforms` (enveloped-signature, UBLExtensions exclusion, QR `AdditionalDocumentReference[ID='QR']` exclusion) before hashing. Use `xmldsigjs` or `xml-c14n`. Also fix `removeSignatureBlock` (CRIT-4 sub: `signing.ts:192-196` only strips `cac:Signature` + `ext:UBLExtensions`, not via the declared XPath).
- **Files:** `packages/zatca/src/signing.ts`.
- **Effort:** 3–7 days. **Verify:** submit to ZATCA sim; `validationResults` must not ERROR on the reference digest.

## CRIT-5 — Simplified (B2C) QR carries only tags 1–5 (missing 6,7,8,9)
- **File:** `apps/web/src/lib/zatca-qr.ts:35-49` (Phase-1 TLV is the only QR ever persisted because Phase-2 signing never runs — see CRIT-2).
- **Impact:** Every printed B2C QR fails ZATCA app scan (missing hash/signature/public-key/cert-signature tags).
- **Fix:** After CRIT-2/4, ensure the signed 9-tag QR (`packages/zatca/src/signing.ts:146` `buildQrCodeData` already builds 1–9) overwrites `invoices.zatca_qr` (`zatca-einvoice.ts:336` does this, but only inside the never-run submission path).
- **Effort:** <1 day (after CRIT-2/4).

## CRIT-6 — Database RLS is a deployed no-op (no tenant-isolation backstop)
- **Files:** `apps/web/drizzle/0016_rls_agency_isolation.sql:79-113` ; `apps/web/src/lib/db-context.ts` (used by 0 routes) ; `apps/web/src/lib/db.ts:4`
- **Evidence:** Every table has `CREATE POLICY bypass_for_service_role ... AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true)`. The app connects as that owner role; PERMISSIVE policies are OR-combined → bypass always TRUE. The `agency_isolation` policy also self-disables when `app.current_agency_id` is unset (lines 124-126), and `withAgencyContext` (the only setter) is wired into **zero** routes (grep).
- **Impact:** No DB-level isolation. Any query that forgets `eq(table.agencyId, agencyId)` is a cross-tenant breach with no backstop. (CRIT-7 was one such; others may exist.)
- **Fix (choose one):**
  - **(a) Real RLS:** create a restricted `app_user` Postgres role with no BYPASSRLS, point the app's connection at it, **drop** the `bypass_for_service_role` policies, and wrap every route's DB work in `withAgencyContext(agencyId, tx => ...)`. Fix `db-context.ts:14` to use a bound param (`SELECT set_config('app.current_agency_id', $1, true)`) instead of string interpolation.
  - **(b) App-layer only (lighter):** keep app-layer scoping as the sole control, but add a CI guard/lint/test that asserts every `db.select/update/delete` on a tenant table includes an `agencyId` predicate. Audit all 130 routes once.
- **Effort:** 3–7 days for (a); 1–3 days for (b). **Verify:** `packages/database/src/__tests__/rls.integration.test.ts` currently tests policies in isolation — extend it to connect as the real app role and assert cross-agency reads/writes are blocked.

## CRIT-8 — VAT Return not sourced from `journal_lines` → filed VAT ≠ GL
- **File:** `apps/web/src/app/api/reports/vat-return/route.ts:48-90,118-154`
- **Evidence:** Output VAT summed from `invoices.vatHalalas` grouped by `type` (filtered `status NOT IN ('cancelled')`); input VAT from `journal_lines` account 1230. The real liability is `journal_lines` account 2200. A cancelled invoice is excluded from the report but its 2200 reversal stays in the GL → report ≠ trial balance.
- **Impact:** The number filed to ZATCA does not equal VAT Payable in the TB. Under/over-payment, failed reconciliation, penalties.
- **Fix:** Compute Output VAT as the **net credit movement on account 2200** and Input VAT as the **net debit on 1230**, both from posted `journal_lines` joined to `journalEntries` (exclude `source='closing'`) — exactly as `reports/trial-balance` and `reports/balance-sheet` already do (use them as the reference implementation). Keep the invoice-level breakdown only as supplementary display.
- **Files:** `apps/web/src/app/api/reports/vat-return/route.ts`.
- **Effort:** 1–3 days. **Verify:** seed invoices + a cancellation + a refund on a live DB; assert VAT-return output VAT == sum of 2200 net credits == balance-sheet VAT Payable.
- **Note:** the VAT *ledger itself* (2200/1230 postings) reconciles by construction — only the report's data source is wrong.

## CRIT-9 — Supplier (AP) aging never reconciles to GL account 2000
- **Files:** `apps/web/src/app/api/reports/supplier-aging/route.ts:24-31,64-86` ; `apps/web/src/app/api/invoices/create/route.ts` (no `suppliers.balanceHalalas` update)
- **Evidence:** AP aging reads denormalized `suppliers.balanceHalalas`, which is decremented on supplier payment but **never incremented when a purchase liability is booked at invoice time** (invoice-create credits 2000 in the journal but never touches `balanceHalalas`). Subledger understates liabilities vs GL 2000.
- **Impact:** Supplier statements / AP aging wrong; control account (2000) ≠ subledger.
- **Fix (two options):**
  - **Preferred:** add a supplier dimension to journal lines (a nullable `supplier_id` column on `journal_lines`, or a `supplier_id` on `journalEntries`) and derive aging by grouping 2000 lines per supplier. Bigger change.
  - **Pragmatic:** maintain `suppliers.balanceHalalas` at invoice-posting time (increment by the AP credit when a principal/cost line books 2000) and add a reconciliation report comparing `sum(suppliers.balanceHalalas)` to GL 2000.
- **Files:** `supplier-aging/route.ts`, `invoices/create/route.ts` (+ schema/migration if adding supplier_id).
- **Effort:** 3–7 days. **Verify:** principal booking → invoice → assert supplier balance increased and equals 2000 movement.

## CRIT-10 — Refund GL not migrated to the line-based model (wrong revenue/COGS/AR/deferred reversal)
- **File:** `apps/web/src/app/api/refunds/process/route.ts` — key lines: revenue account `82-84` (`revenueModel = details.revenueModel ?? 'principal'`), revenue/VAT legs `112-134`, COGS reversal `143-147` (`refundCost = round((booking.costPriceHalalas ?? 0) * refundRatio)`), invoice paid/status update `252-264`.
- **Evidence / four distinct defects:**
  1. **Single revenue account:** reverses revenue to ONE account from `details.revenueModel` — wrong for mixed agent+principal bookings whose original invoice split across 4000/4100.
  2. **Stale COGS source:** reverses COGS using legacy aggregate `booking.costPriceHalalas`, which is 0/stale for `booking_lines`-driven invoices → COGS/AP under- or un-reversed.
  3. **Deferred revenue:** refund of an Umrah/Hajj/package invoice still in deferred 3201 debits 4100 (empty) instead of 3201 → 3201 liability never unwinds (IFRS 15 misstatement on the highest-value product).
  4. **Partial-payment AR:** for a partially-paid invoice the refund credits Bank for the full refund and reverses Revenue/VAT, but never credits the still-open AR (1120) → AR overstated, revenue under-reversed (Booking-agent C1). Cancellation-fee revenue (4200) also recognised for fees never collected when not fully paid (Booking-agent H2).
- **Impact:** After CRIT-1 unblocked refunds, every refund on a modern/mixed/deferred/partially-paid invoice misstates revenue, COGS, AP, AR and 3201.
- **Fix:** Rewrite the refund GL to **read the ORIGINAL invoice's `journal_lines` and pro-rate each line by `refundRatio`** (mirror the approach in `invoices/credit-note/route.ts:77-101`, which already resolves accounts from the original entry). Split the credit between Bank (cash actually returned) and AR (still-open portion). Reverse 3201 when `revenueRecognizedAt IS NULL && deferredUntil` is in the future. Only recognise cancellation-fee revenue against cash actually retained.
- **Files:** `apps/web/src/app/api/refunds/process/route.ts`.
- **Effort:** 3–7 days. **Verify:** add the missing refund tests (there are NONE today) for: full-paid principal, full-paid agent, mixed agent+principal, partially-paid, deferred-revenue-before-travel, cancellation-fee. Assert TB stays balanced and each account reverses correctly.

---

# HIGH

## HIGH-1 — Standalone credit note never updates the original invoice → double-counted AR
- **File:** `apps/web/src/app/api/invoices/credit-note/route.ts` (whole tx) — there is no `tx.update(invoices)` on the original.
- **Evidence:** Original stays `status='issued'` with full `totalHalalas` outstanding; still counted in credit-limit checks (`invoices/create:184-202`) and AR aging; a payment can still be recorded against it (`payments/record:59-61` only blocks `cancelled`/`refunded`).
- **Fix:** Within the same tx, atomically reduce/settle the original (mark `cancelled` if fully credited & unpaid, or track a `creditedHalalas`), and block further payments against a credited invoice.
- **Effort:** 1–3 days. *(Note: the cumulative-credit ceiling is already shipped in `fb5c083`; this is the remaining original-invoice lifecycle update.)*

## HIGH-2 — Idempotency completion is non-atomic with the business tx → crash-then-retry double-post
- **File:** `apps/web/src/lib/idempotency.ts:41-71`
- **Evidence:** `withIdempotency` inserts the `pending` claim and later flips to `complete` (lines 61-63) on `db`, OUTSIDE the business transaction inside `fn()`. If the process dies after `fn()` commits but before the complete-update, the key stays `pending`; after `PENDING_STALE_MS` (5 min) a retry re-claims and re-runs. The in-tx markers in the routes are `onConflictDoNothing`, which is a no-op because the `pending` row already exists.
- **Fix:** Make the in-tx marker authoritative: change route markers to `onConflictDoUpdate` setting `status='complete', result, expiresAt` (so commit + finalize are atomic), and have `withIdempotency` treat an existing `complete` row as the success signal; keep the post-tx update only as a harmless fallback. Apply consistently to `payments/record`, `refunds/process`, `supplier-payments/create`, `invoices/credit-note`, installment-pay.
- **Files:** `apps/web/src/lib/idempotency.ts` + the five caller routes.
- **Effort:** 1–3 days. **Verify:** existing idempotency tests + a new test simulating "tx committed, complete-update skipped, retry after stale window" asserts no second posting.

## HIGH-7 — No `(agency, source, source_id[, date])` journal uniqueness → FX revaluation double-posts
- **File:** `apps/web/src/app/api/accounting/fx-revaluation/route.ts:41-57` (non-atomic existence check); `apps/web/src/lib/schema/accounting.ts:48-54` (unique only on `(agencyId, entryNumber)`).
- **Evidence:** Two concurrent runs for the same date both pass the SELECT and both post per-account entries (`source='fx_revaluation'`, `sourceId=accountId`).
- **Fix:** Add a partial unique index `journal_entries(agency_id, source_id, date) WHERE source='fx_revaluation'`; in the per-account tx insert the entry with `onConflictDoNothing().returning()` and **abort the tx (return early before consuming the journal counter / inserting lines / updating the bank balance)** if 0 rows — order the counter fetch AFTER a successful claim to avoid number gaps. **Do not** use a global `(agency,source,source_id)` unique (it would block legitimate monthly revaluations). Advisory locks are unreliable on the pooled Neon driver — avoid.
- **Files:** `instrumentation.ts` (index), `accounting/fx-revaluation/route.ts`.
- **Effort:** 1–3 days (needs a live DB to verify no counter gaps).

## HIGH-8 — Customer AR aging sourced from `invoices`, not `journal_lines` account 1120
- **File:** `apps/web/src/app/api/reports/aging/route.ts:1-5,39-60` (imports only `invoices`,`customers`; computes `totalHalalas - paidHalalas`).
- **Evidence:** Manual journals to 1120, credit notes, FX revaluation of AR, opening balances never appear in aging → control account (1120) diverges from subledger.
- **Fix:** Reconcile aging to posted 1120 lines (same pattern as CRIT-8). At minimum surface a reconciliation difference.
- **Effort:** 1–3 days.

## HIGH-9 — Three divergent schema sources; `drizzle-kit migrate` skips 0003–0019
- **Files:** `apps/web/drizzle/meta/_journal.json` (registers only 0000–0002) ; `apps/web/src/instrumentation.ts` ; `apps/web/src/app/api/setup-db/route.ts`.
- **Evidence:** `db:migrate` applies only journal-registered files, skipping bigint widening (0012), document-number uniqueness (0013), RLS (0016), ZATCA (0017–0019). On a boot-only env, the per-agency invoice/voucher/journal-number unique indexes from 0013 are NOT enforced; money columns may stay `integer` (overflow ~21M SAR on Hajj/Umrah group invoices).
- **Fix:** Pick ONE mechanism. If keeping `instrumentation.ts` as the source of truth, ensure it contains every constraint from 0012/0013/0016/0017–0019 (add the missing `journal_entries_agency_number_uq`, `payments_agency_voucher_uq`, `receipt_vouchers_agency_voucher_uq`, `supplier_payments_agency_voucher_uq` if absent). If keeping drizzle, regenerate `_journal.json` for 0003–0020 and run `db:migrate` in deploy.
- **Effort:** 1–3 days.

## HIGH-11 — Reconcile cron auto-voids `pending` orphan tickets without a final provider check
- **File:** `apps/web/src/app/api/jobs/reconcile-pending-tickets/route.ts:114-122,403-436` (`case 'pending': finalStatus='void'`); credential-unreachable failures still increment `reconciliationAttempts` (`:141-143`, `:101-109`).
- **Evidence:** After 20 failed attempts a `pending` ticket is force-`void`ed though Phase-2 issuance may have succeeded at BSP → live BSP ticket + charge, ERP shows void, never invoiced → uncollected revenue.
- **Fix:** Route `pending` orphans to a manual-review status/queue instead of auto-void; do not count transient (provider-unreachable / credential-missing) failures toward `MAX_ATTEMPTS`.
- **Effort:** 1–3 days.

## HIGH (booking) — Add-line while a DRAFT invoice exists desyncs totals
- **File:** `apps/web/src/app/api/bookings/[id]/lines/route.ts:65-78` (add-line guard checks only `status IN ('issued','partial','paid')`, excludes `draft`) vs cancel guards that use `ne(status,'cancelled')`.
- **Fix:** Use a single shared "live invoice exists" predicate (`ne(status,'cancelled')`) across line-add, line-cancel, booking-cancel.
- **Effort:** <1 day.

## HIGH (integrations) — A4/A5/A6
- **A4** `apps/web/src/app/api/auth/forgot-password/route.ts:141-149` — Resend `emails.send` has no timeout (other providers use `fetchWithTimeout` 15s). Wrap in `Promise.race` with a timeout; treat as best-effort. *(<1 day)*
- **A5** `apps/web/src/lib/providers/amadeus.ts:63-91` — OAuth token cache stores only the result, not the in-flight promise → cold-start thundering herd hits Amadeus token rate limit (429). Store `Promise<CachedToken>` in the map. *(<1 day)*
- **A6** `apps/web/src/lib/provider-sync-log.ts:11-27` — provider sync events go to stdout only; no queryable `provider_sync_log` table for financial reconciliation. Add an indexed table. *(1–3 days)*

---

# MEDIUM

| ID | File:line | Issue | Fix | Effort |
|----|-----------|-------|-----|--------|
| MED-1 | `apps/web/src/lib/period-lock.ts:24,36` | Open-by-default: malformed date returns; no period row = not locked → backdated postings into never-locked months always succeed | Add an agency-level "books closed through" date, or treat any month before the latest locked month as locked | 1–3d |
| MED-2 | `apps/web/src/app/api/accounting/fx-revaluation/route.ts:60-67` | Docstring claims AR/AP revaluation but only `bankAccounts` are revalued (IAS 21 gap) | Extend to foreign-currency AR/AP monetary balances, or correct the documented scope | 1–3d |
| MED-3 | `apps/web/src/app/api/accounting/periods/route.ts:184-212` | Year-end close fires on December lock without verifying Jan–Nov locked → late entries into an earlier open month escape retained earnings | Require all 12 months locked before generating the closing entry | 1–3d |
| MED-5 | `apps/web/src/lib/schema/accounting.ts:32-76` | No DB CHECK that an entry balances or that line amounts are non-negative | Add `CHECK(debit_halalas>=0 AND credit_halalas>=0)` and a deferred trigger asserting Σdr=Σcr per entry | 1–3d |
| MED-6 | `packages/zatca/src/xml-builder.ts:241` | TaxSubtotal `Percent` hardcoded `vatAmount>0?0.15:0`, discarding per-line rate → BR-KSA line/subtotal percent mismatch; breaks if statutory rate changes | Pass the real rate (`vatAmount/taxableAmount` or `agency.vatRate`) | <1d |
| MED-7 | `apps/web/src/lib/zatca-einvoice.ts:428-444` | VATEX exemption code only for Z-flights & Umrah/Hajj; other zero-rated/exempt lines emit no `TaxExemptionReasonCode` → BR-KSA-44/45 rejection | Carry an explicit exemption reason per non-standard line from `booking_lines`; reject issuance if a Z/E line lacks one | 1–3d |
| MED-8 | `apps/web/src/lib/zatca-einvoice.ts:111,357` | B2B/B2C clearance-vs-reporting routed solely by buyer-VAT presence → B2B buyer without VAT misrouted to reporting | Drive from explicit invoice classification; validate buyer VAT format (15 digits, starts 3, ends 03) | 1–3d |
| MED-9 | `apps/web/src/app/api/invoices/create/route.ts:367` | ZATCA submission runs after the tx/idempotency wrapper → crash after clearance loses local state, retry re-signs with new ICV (duplicate/gap) | Make submission idempotent keyed on invoice UUID; check ZATCA status before re-signing | 1–3d |
| MED-10 | `apps/web/src/app/api/accounting/journal/route.ts:88-103` | Manual journal silently bumps the largest line by ≤1 halala instead of routing to the rounding account | Route the remainder to the dedicated rounding account (match `validateAndCorrect`); reject non-rounding diffs | <1d |
| MED-11 | `apps/web/src/lib/api-auth.ts:76-93` | FAIL-OPEN suspension check: a suspended/expired agency whose row read errors keeps full API access (billing bypass, not a data breach) | Distinguish "row not found" (fail closed) from infra error (fail open); alert when the swallow path triggers | <1d |
| MED-13 | `apps/web/src/app/api/bookings/[id]/payment-plan/installments/[installmentId]/pay/route.ts:31,144` | Installment double-pay via client-overridable idempotency key + non-atomic `status='paid'` flip | Make the flip atomic (`...WHERE status!='paid' RETURNING`, abort if 0); forbid client override of the per-installment key | <1d |
| MED-14 | `apps/web/src/app/api/quotes/[id]/convert/route.ts:104-131,63-66` | Hardcodes `revenueModel:'agent'` with cost defaulting to 0 → gross sales misclassified as pure commission | Default to `principal` (matches booking GET default) or carry the model from the quote | <1d |
| MED-15 / B2,B3,B4,B5,B6 | see below | Performance: non-sargable date casts + unbounded result sets | see below | 1–3d |

### MED-15 / Performance detail
- **B2** `apps/web/src/app/api/reports/supplier-aging/route.ts:40-52` — `lte(sql\`${supplierPayments.date}::date\`, ...)` casts the text column → defeats `idx_supplier_payments_agency_date`; also no LIMIT + O(payments×suppliers) `.includes` in JS. Compare as plain text (ISO dates sort chronologically), aggregate in SQL with `GROUP BY supplier_id`.
- **B3** `apps/web/src/app/api/reports/booking-profitability/route.ts:27-32` — `cast(${bookings.createdAt} as date)` defeats `idx_bookings_agency_created`. Compare the timestamp column directly to a timestamp range (push the cast to the literal).
- **B4** `apps/web/src/app/api/reports/aging/route.ts:95-108` and `apps/web/src/app/api/reports/dashboard/route.ts:76-93` — unbounded result sets (all open invoices / full-year `vatInvoices`). Paginate or aggregate server-side.
- **B5** `apps/web/src/app/api/jobs/reconcile-pending-tickets/route.ts:98-177` — serial per-ticket GDS round-trip (50×15s worst case > serverless limit). Bound by wall-clock, small concurrency pool, cache `resolveFlightProviderByCode` per (agency,providerCode) per run.
- **B6** `apps/web/src/app/api/reports/aging/route.ts:124-172` — in-memory grouping/sorting over the full set; push bucketing into SQL.
- **Impact estimate:** negligible at 10 agencies; multi-second at 100; timeout-prone at 1,000.

---

# LOW
- **L1** `apps/web/src/app/api/invoices/[id]/apply-advance/route.ts:50-59` — voucher not verified to belong to the invoice's customer → cross-customer deposit/AR contamination. Add `eq(receiptVouchers.customerId, invoice.customerId)`.
- **L2** `apps/web/src/app/api/reports/vat-return/route.ts:107` — zero-rated detection includes types 388/383 but excludes 381; a credit note vs an international zero-rated flight isn't subtracted. Include 381 with sign handling.
- **L3** `packages/zatca/src/signing.ts:225` — `SigningTime` UTC `Z` while `IssueTime` is `+03:00`; normalize to `+03:00`.
- **L4** `apps/web/src/lib/postJournalEntry.ts:53` vs `apps/web/src/lib/gl-accounts.ts:60` — divergent 5900 ("Other Expenses" vs "FX Loss"); reclassify migrated rows.
- **L5/L6/L7** — Amadeus token dedup (=A5), provider-sync-log table (=A6), supplier-payment expense maps hardcoded locally (centralize in `gl-accounts.ts`).

---

# Suggested order for the next session
1. **CRIT-10** refund GL rewrite — highest financial blast radius now that refunds post (needs live DB + write the missing refund tests first).
2. **CRIT-8 + HIGH-8 + CRIT-9** re-source VAT-return / AR-aging / AP-aging from `journal_lines` (shared pattern; do together).
3. **CRIT-6** decide RLS strategy (a) or (b) and execute.
4. **CRIT-2 → CRIT-4 → CRIT-3 → CRIT-5** ZATCA Phase-2 pipeline (needs sandbox; biggest single block).
5. **HIGH-1, HIGH-2, HIGH-7, HIGH-9, HIGH-11** integrity/lifecycle.
6. MED batch (start with the <1d ones: MED-6, MED-10, MED-11, MED-13, MED-14, B2/B3) then the rest.

# Verdict reminder
Until at least CRIT-2..6 and CRIT-8..10 are done **and verified against a live DB + ZATCA sandbox**, the system stays **NOT APPROVED** for production use by real KSA travel agencies.
