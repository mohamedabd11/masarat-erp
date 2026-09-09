/**
 * Saudi statutory end-of-service benefit estimates.
 *
 * Article 84 base benefit:
 *   - half of the last monthly wage for each of the first five service years;
 *   - one full monthly wage for each following service year;
 *   - partial years are proportional to the time served.
 *
 * Article 85 affects resignation payout only. It must not reduce the base
 * provision used for ordinary termination/contract expiry.
 *
 * All amounts are integer halalas.
 */

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed;
}

function anniversary(hireDate: Date, year: number): Date {
  const result = new Date(Date.UTC(year, hireDate.getUTCMonth(), hireDate.getUTCDate()));
  if (result.getUTCMonth() !== hireDate.getUTCMonth()) result.setUTCDate(0);
  return result;
}

export function yearsOfService(hireDateStr: string, asOfDateStr?: string): number {
  const hireDate = parseDateOnly(hireDateStr);
  const asOf = parseDateOnly(asOfDateStr ?? new Date().toISOString().slice(0, 10));
  if (!hireDate || !asOf || asOf < hireDate) return 0;

  let completedYears = asOf.getUTCFullYear() - hireDate.getUTCFullYear();
  let lastAnniversary = anniversary(hireDate, hireDate.getUTCFullYear() + completedYears);
  if (asOf < lastAnniversary) {
    completedYears -= 1;
    lastAnniversary = anniversary(hireDate, hireDate.getUTCFullYear() + completedYears);
  }
  const nextAnniversary = anniversary(hireDate, hireDate.getUTCFullYear() + completedYears + 1);
  const fraction = (asOf.getTime() - lastAnniversary.getTime())
    / (nextAnniversary.getTime() - lastAnniversary.getTime());
  return completedYears + Math.max(0, Math.min(1, fraction));
}

export function calculateEosb(lastMonthlyWageHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  if (!Number.isSafeInteger(lastMonthlyWageHalalas) || lastMonthlyWageHalalas <= 0) return 0;
  const years = yearsOfService(hireDateStr, asOfDateStr);
  if (years <= 0) return 0;

  const firstFiveYears = Math.min(years, 5);
  const laterYears = Math.max(0, years - 5);
  return Math.round(
    (lastMonthlyWageHalalas / 2) * firstFiveYears
    + lastMonthlyWageHalalas * laterYears,
  );
}

export function resignationEosbMultiplier(serviceYears: number): number {
  if (!Number.isFinite(serviceYears) || serviceYears < 2) return 0;
  if (serviceYears <= 5) return 1 / 3;
  if (serviceYears < 10) return 2 / 3;
  return 1;
}

export function calculateResignationEosb(lastMonthlyWageHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  const years = yearsOfService(hireDateStr, asOfDateStr);
  return Math.round(calculateEosb(lastMonthlyWageHalalas, hireDateStr, asOfDateStr) * resignationEosbMultiplier(years));
}

export type TerminationType = 'contract_end' | 'employer' | 'resignation' | 'article_80' | 'article_87' | 'force_majeure' | 'other';

export function calculateTerminationSettlement(
  lastMonthlyWageHalalas: number,
  hireDateStr: string,
  terminationDate: string,
  terminationType: TerminationType,
): { baseBenefitHalalas: number; entitlementRateBps: number; settlementHalalas: number } {
  const baseBenefitHalalas = calculateEosb(lastMonthlyWageHalalas, hireDateStr, terminationDate);
  let multiplier = 1;
  if (terminationType === 'resignation') {
    multiplier = resignationEosbMultiplier(yearsOfService(hireDateStr, terminationDate));
  } else if (terminationType === 'article_80') {
    multiplier = 0;
  }
  return {
    baseBenefitHalalas,
    entitlementRateBps: Math.round(multiplier * 10_000),
    settlementHalalas: Math.round(baseBenefitHalalas * multiplier),
  };
}

/** Change in the statutory base benefit during the latest service month. */
export function monthlyEosbAccrual(lastMonthlyWageHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  const asOf = parseDateOnly(asOfDateStr ?? new Date().toISOString().slice(0, 10));
  if (!asOf) return 0;
  const priorMonthLastDay = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0)).getUTCDate();
  const prior = new Date(Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth() - 1,
    Math.min(asOf.getUTCDate(), priorMonthLastDay),
  ));
  const current = calculateEosb(lastMonthlyWageHalalas, hireDateStr, asOf.toISOString().slice(0, 10));
  const previous = calculateEosb(lastMonthlyWageHalalas, hireDateStr, prior.toISOString().slice(0, 10));
  return Math.max(0, current - previous);
}
