# Masarat ERP — Developer Guide

Multi-tenant SaaS ERP for Saudi travel agencies. Built for ZATCA compliance, IFRS 15 revenue recognition, and IATA BSP settlement.

## Stack

- **Frontend/Backend:** Next.js 14 App Router (TypeScript), Tailwind, Shadcn/ui
- **Database:** PostgreSQL via Neon serverless, Drizzle ORM
- **Auth:** Firebase Auth (JWT claims carry `agencyId` + `role`)
- **Monorepo:** pnpm workspaces + Turbo
- **Deployment:** Vercel (apps/web), Firebase Functions (background jobs)

## Repo Layout

```
apps/web/          Main Next.js app (ERP)
apps/mobile/       React Native (Expo) companion app
packages/accounting/  IFRS 15 revenue engine (agent vs principal)
packages/database/    Drizzle schema mirror + RLS utilities
packages/zatca/       ZATCA Phase 2 e-invoice (XML, QR, signing)
packages/firebase/    Firebase Auth/Realtime bindings
functions/            Firebase Cloud Functions (webhooks, cron)
```

## Key Directories in apps/web/src

```
app/api/           API routes (Next.js Route Handlers)
app/[locale]/      UI pages (next-intl i18n — ar/en)
components/        Feature-scoped React components
lib/               Core logic (see critical files below)
lib/schema/        Drizzle table definitions (single source of schema truth)
hooks/             React hooks (data fetching, realtime)
```

## Critical Files

| File | Purpose |
|------|---------|
| `lib/schema/bookings.ts` | `bookings` + `bookingLines` tables. bookingLines is the **financial source of truth**. |
| `lib/booking-financials.ts` | `syncBookingTotalsFromLines()` — the **only** function allowed to update booking financial totals. |
| `lib/schema/index.ts` | Schema barrel export — always import from here, not from individual schema files. |
| `lib/api-auth.ts` | `verifyAuth()`, `assertRole()`, `ApiAuthError`, `BusinessError`. Used in every API route. |
| `lib/postJournalEntry.ts` | Double-entry GL posting. Called after invoice creation. |
| `lib/gl-accounts.ts` | GL account code lookup (agent vs principal revenue model). |
| `instrumentation.ts` | DB migrations run on cold start. **Append-only, never reorder.** |
| `app/api/bookings/[id]/lines/route.ts` | API to manage booking_lines (GET list, POST create). |
| `app/api/invoices/create/route.ts` | Invoice creation — uses booking_lines for per-line VAT and GL. |

## The Financial Architecture (Most Important)

### booking_lines is the source of truth

Every booking **must** have at least one active non-legacy `booking_line`. The `bookings` table stores only **derived cached totals** — never an independent financial source.

```
bookings.totalPriceHalalas  = SUM(booking_lines.totalPriceExclVatHalalas + vatHalalas)
bookings.costPriceHalalas   = SUM(booking_lines.totalCostHalalas)
bookings.profitHalalas      = totalPrice - totalCost
```

### The only write path: syncBookingTotalsFromLines()

```typescript
import { syncBookingTotalsFromLines } from '@/lib/booking-financials';

// Always call inside a transaction when lines change:
await db.transaction(async (tx) => {
  await tx.insert(bookingLines).values({ ... });
  await syncBookingTotalsFromLines(bookingId, agencyId, tx);
});
```

### NEVER do this (ESLint will block it in CI)

```typescript
// ❌ FORBIDDEN — direct update of derived financial totals
await db.update(bookings).set({ totalPriceHalalas: 999 });

// ❌ FORBIDDEN — also blocked via PATCH API (fields are in STRIP set)
PATCH /api/bookings/:id  { totalPriceHalalas: 999 }  // silently ignored
```

The ESLint rule in `apps/web/.eslintrc.json` (`no-restricted-syntax`) enforces this at CI. The only exempted file is `lib/booking-financials.ts`.

### Where booking_lines are created

Every booking creation path creates lines atomically:

| Path | How |
|------|-----|
| `POST /api/bookings/create` | One line per `body.lines[]`, or one default line from `pricing` |
| `POST /api/bookings/[id]/lines` | Adds a new line + calls syncBookingTotalsFromLines |
| `POST /api/quotes/[id]/convert` | One consolidating line (vatCategory='Z', full amount as priceExclVat) |

### booking_line VAT categories (ZATCA)

```typescript
type VatCategory = 'S' | 'Z' | 'E' | 'O';
// S = Standard 15%  |  Z = Zero-rated  |  E = Exempt  |  O = Outside scope
const VAT_RATE_BPS = { S: 1500, Z: 0, E: 0, O: 0 };  // basis points
```

All amounts are stored in **halalas** (Saudi halala = 1/100 SAR). Never use floats for money.

### Legacy lines (isLegacy flag)

Existing bookings before the booking_lines migration have one `isLegacy=true` line (created as backfill in `instrumentation.ts`). These lines are:
- Immutable — never used for VAT/GL calculations
- Skipped by `syncBookingTotalsFromLines()` (only processes `isLegacy=false` lines)
- Preserved for audit trail only

## Two State Machines (separate concerns)

| State | Field | Values | Meaning |
|-------|-------|---------|---------|
| Commercial | `bookings.status` | `draft → confirmed → completed → cancelled` | Lifecycle of the sale |
| Operational | `bookingLines.operationalStatus` | `pending → confirmed → ticketed → issued → cancelled` | Per-service delivery status |

Never confuse these. A booking can be `confirmed` commercially while a flight line is still `pending` operationally.

## Revenue Models (IFRS 15)

- **`agent`**: Agency earns commission only. GL posts net commission as revenue.
- **`principal`**: Agency owns the service. GL posts full selling price as revenue, cost as COGS.

Set at `bookingLines.revenueModel`. Drives journal entry logic in `lib/postJournalEntry.ts` and `packages/accounting/`.

## Multi-Tenancy

Every DB table has `agencyId`. Every API route extracts it from the JWT via `verifyAuth()`:

```typescript
const { agencyId, role, uid } = await verifyAuth(request);
```

Never trust `agencyId` from request body. Always use the one from the verified token.

## Role Hierarchy

```
super_admin > admin > manager > accountant > agent > viewer
```

Defined in `lib/api-auth.ts`. Key sets:
- `ROLES_AGENT_UP` — agent and above (most operations)
- `ROLES_MANAGER_UP` — manager and above (financial operations, booking lines)

## Database Migrations

Migrations run in `instrumentation.ts` via raw SQL `IF NOT EXISTS` guards. Rules:
1. **Append-only** — never reorder or delete existing blocks
2. **Idempotent** — every statement must be safe to run multiple times
3. Always use `IF NOT EXISTS` / `IF NOT EXISTS` guards

## API Route Conventions

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    // ... always filter by agencyId
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
```

Error messages are in Arabic. Status codes follow HTTP semantics.

## GOSI (Social Insurance) Rates

```typescript
const GOSI_EMPLOYER_RATE = employee.nationalityType === 'expat' ? 0.02 : 0.0975;
// Saudi: 9.75% (9% pension + 0.75% occupational hazard)
// Expat:  2.00% (occupational hazard only)
```

`nationalityType` is required on employee creation — no silent default.

## ZATCA Compliance

- Invoice XML generated by `packages/zatca/`
- QR code: TLV-encoded, generated by `lib/zatca-qr.ts`
- Each invoice line has its own `vatCategory` and `vatRateBps`
- Hashing and signing flow: `packages/zatca/signing.ts`

## Environment Variables

All sensitive vars (`ENCRYPTION_KEY`, `SUPER_ADMIN_EMAIL`, Firebase keys, Amadeus credentials) are set in Vercel as encrypted env vars. **Never commit secrets.** Schema validated at startup in `lib/env-validate.ts`.

## Running Locally

```bash
pnpm install
cd apps/web
cp .env.example .env.local   # fill in Neon DB URL, Firebase config
pnpm dev
```

TypeScript check: `npx tsc --noEmit` from `apps/web/`
Lint: `npx eslint src/` from `apps/web/`
Tests: `pnpm vitest` from `apps/web/`

## Cron Jobs (Vercel)

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/jobs/expire-pnrs` | 02:00 UTC daily | Expire stale PNR holds |
| `/api/jobs/reconcile-pending-tickets` | 03:00 UTC daily | Reconcile pending ticket status with GDS |
| `/api/jobs/generate-recurring-invoices` | On schedule | Generate recurring invoice instances |
