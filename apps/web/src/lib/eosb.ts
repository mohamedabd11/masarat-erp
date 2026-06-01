/**
 * End-of-Service Benefit (EOSB) calculations.
 *
 * Saudi Labor Law (art. 84) — gratuity on a full-term separation:
 *   - < 2 years service:   no entitlement
 *   - years 2 – 5:         (⅓ of a month's wage) × number of full years
 *   - years > 5:           (⅓ × 5) for the first five years
 *                          + (a full month's wage) × (full years − 5)
 *
 * IAS 19 requires the EOSB liability to be accrued monthly as an expense over
 * the employee's service rather than recognised in full at termination. We
 * therefore spread the cumulative art. 84 entitlement evenly across the months
 * actually worked to date.
 *
 * All amounts are in halalas (integer minor units).
 */

const MS_PER_YEAR  = 365.25 * 24 * 60 * 60 * 1000;
const MS_PER_MONTH = MS_PER_YEAR / 12;

function yearsOfService(hireDateStr: string, asOfDateStr?: string): number {
  const hireDate = new Date(hireDateStr);
  const asOf     = asOfDateStr ? new Date(asOfDateStr) : new Date();
  return (asOf.getTime() - hireDate.getTime()) / MS_PER_YEAR;
}

function monthsOfService(hireDateStr: string, asOfDateStr?: string): number {
  const hireDate = new Date(hireDateStr);
  const asOf     = asOfDateStr ? new Date(asOfDateStr) : new Date();
  return (asOf.getTime() - hireDate.getTime()) / MS_PER_MONTH;
}

/**
 * Total EOSB entitlement accrued for an employee as of a given date (halalas),
 * per Saudi Labor Law art. 84.
 */
export function calculateEosb(basicSalaryHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  if (!hireDateStr || !basicSalaryHalalas) return 0;
  const years = yearsOfService(hireDateStr, asOfDateStr);
  if (!Number.isFinite(years) || years < 2) return 0;

  const fullYears = Math.floor(years);
  const firstFive = Math.min(fullYears, 5);
  const afterFive = Math.max(0, fullYears - 5);

  // ⅓ of a month's wage per year for the first five years,
  // a full month's wage per year thereafter.
  return Math.round(
    (basicSalaryHalalas / 3) * firstFive +
    basicSalaryHalalas * afterFive,
  );
}

/**
 * Monthly EOSB provision to accrue for an employee (halalas).
 *
 * Equals the cumulative art. 84 entitlement to date divided by the number of
 * months actually worked, so that posting one accrual per month builds the
 * liability up to `calculateEosb(...)` over the service period (IAS 19).
 */
export function monthlyEosbAccrual(basicSalaryHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  if (!hireDateStr || !basicSalaryHalalas) return 0;

  const totalEosb = calculateEosb(basicSalaryHalalas, hireDateStr, asOfDateStr);
  if (totalEosb <= 0) return 0;

  const months = monthsOfService(hireDateStr, asOfDateStr);
  if (!Number.isFinite(months) || months < 1) return 0;

  return Math.round(totalEosb / months);
}
