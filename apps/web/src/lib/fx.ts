import { eq, and, lte, desc } from 'drizzle-orm';
import { exchangeRates } from '@/lib/schema';
import type { DB, Tx } from '@/lib/db';

type DbOrTx = DB | Tx;

/** Canonical ISO-4217-style code used by storage and lookups. */
export function normalizeCurrencyCode(value: unknown): string | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** Strict YYYY-MM-DD validation, including real calendar-day boundaries. */
export function isIsoDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

/**
 * Returns the most recent exchange rate for (fromCurrency → toCurrency)
 * that has effectiveDate <= asOfDate, or null if none exists.
 *
 * Rates are stored as rate × 10000 (e.g. 3.75 SAR/USD → 37500).
 */
export async function lookupFxRate(
  agencyId:     string,
  fromCurrency: string,
  toCurrency:   string,
  asOfDate:     string,   // YYYY-MM-DD
  dbOrTx:       DbOrTx,
): Promise<{ storedRate: number; effectiveDate: string } | null> {
  const normalizedFrom = normalizeCurrencyCode(fromCurrency);
  const normalizedTo = normalizeCurrencyCode(toCurrency);
  if (!normalizedFrom || !normalizedTo || !isIsoDateOnly(asOfDate)) return null;

  const [row] = await dbOrTx
    .select({ storedRate: exchangeRates.rate, effectiveDate: exchangeRates.effectiveDate })
    .from(exchangeRates)
    .where(and(
      eq(exchangeRates.agencyId, agencyId),
      eq(exchangeRates.fromCurrency, normalizedFrom),
      eq(exchangeRates.toCurrency,   normalizedTo),
      lte(exchangeRates.effectiveDate, asOfDate),
    ))
    .orderBy(desc(exchangeRates.effectiveDate))
    .limit(1);

  return row ?? null;
}

/**
 * Convert a foreign-currency amount (in minor units, e.g. USD cents)
 * to SAR halalas using a storedRate (rate × 10000 as in exchangeRates table).
 *
 * Formula:  halalas = foreignMinor × storedRate / 10000
 *
 * Example:  10000 USD-cents × 37500 / 10000 = 37500 halalas (375 SAR)
 */
export function fxToHalalas(foreignAmountMinor: number, storedRate: number): number {
  return Math.round(foreignAmountMinor * storedRate / 10000);
}
