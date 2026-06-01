/**
 * End-of-Service Benefit (EOSB) calculations.
 *
 * Saudi Labor Law (art. 84):
 *   - < 2 years service:        no entitlement
 *   - 2–5 years:                ⅓ of basic salary per year
 *   - > 5 years:                ⅓ for the first 5 years, ⅔ for the remainder
 *
 * Simplified "half-month" formula commonly used in Saudi payroll practice and
 * adopted here:
 *   - years 1–5:   (basicSalary / 2) × min(years, 5)
 *   - years > 5:    basicSalary × (years − 5)
 *
 * IAS 19 requires the EOSB liability to be accrued monthly as an expense rather
 * than recognised in full at termination.
 *
 * All amounts are in halalas (integer minor units).
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

function yearsOfService(hireDateStr: string, asOfDateStr?: string): number {
  const hireDate = new Date(hireDateStr);
  const asOf     = asOfDateStr ? new Date(asOfDateStr) : new Date();
  return (asOf.getTime() - hireDate.getTime()) / MS_PER_YEAR;
}

/** Total EOSB amount accrued for an employee as of a given date (halalas). */
export function calculateEosb(basicSalaryHalalas: number, hireDateStr: string, asOfDateStr?: string): number {
  if (!hireDateStr || !basicSalaryHalalas) return 0;
  const years = yearsOfService(hireDateStr, asOfDateStr);
  if (!Number.isFinite(years) || years < 2) return 0;

  const fullYears = Math.floor(years);
  const firstFive = Math.min(fullYears, 5);
  const afterFive = Math.max(0, fullYears - 5);

  return Math.round(
    (basicSalaryHalalas / 2) * firstFive +
    basicSalaryHalalas * afterFive,
  );
}

/** Monthly EOSB provision to accrue for an employee (halalas). */
export function monthlyEosbAccrual(basicSalaryHalalas: number, hireDateStr: string): number {
  if (!hireDateStr || !basicSalaryHalalas) return 0;
  const years = yearsOfService(hireDateStr);
  if (!Number.isFinite(years) || years < 2) return 0;

  // Annual accrual rate: half a month per year for the first 5 years, a full
  // month per year thereafter — spread evenly across 12 months.
  const ratePerYear = years <= 5
    ? Math.round(basicSalaryHalalas / 2)
    : basicSalaryHalalas;
  return Math.round(ratePerYear / 12);
}
