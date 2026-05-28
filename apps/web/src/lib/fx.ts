import { eq, and, lte, desc } from 'drizzle-orm';
import { exchangeRates } from '@/lib/schema';
import type { DB, Tx } from '@/lib/db';

type DbOrTx = DB | Tx;

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
  const [row] = await dbOrTx
    .select({ storedRate: exchangeRates.rate, effectiveDate: exchangeRates.effectiveDate })
    .from(exchangeRates)
    .where(and(
      eq(exchangeRates.agencyId, agencyId),
      eq(exchangeRates.fromCurrency, fromCurrency.toUpperCase()),
      eq(exchangeRates.toCurrency,   toCurrency.toUpperCase()),
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
