import type { GosiRatePeriod } from '@/lib/schema';

export type GosiScheme = 'legacy' | 'new' | 'expat' | 'exempt';
export type GosiRate = Pick<GosiRatePeriod,
  'scheme' | 'effectiveFrom' | 'pensionEmployeeRateBps' | 'pensionEmployerRateBps'
  | 'sanedEmployeeRateBps' | 'sanedEmployerRateBps' | 'occupationalEmployerRateBps'>;

export const GOSI_CEILING_HALALAS = 45_000 * 100;

interface CalculateGosiInput {
  contributoryWageHalalas: number;
  scheme: GosiScheme;
  asOfDate: string;
  sanedApplicable: boolean;
  periods: readonly GosiRate[];
}

export interface GosiCalculation {
  scheme: GosiScheme;
  contributoryWageHalalas: number;
  employeeRateBps: number;
  employerRateBps: number;
  employeeHalalas: number;
  employerHalalas: number;
  rateEffectiveFrom: string | null;
}

export function calculateGosi(input: CalculateGosiInput): GosiCalculation {
  if (!Number.isSafeInteger(input.contributoryWageHalalas) || input.contributoryWageHalalas < 0) {
    throw new Error('GOSI contributory wage must be a non-negative safe integer');
  }
  if (input.scheme === 'exempt') {
    return {
      scheme: input.scheme,
      contributoryWageHalalas: 0,
      employeeRateBps: 0,
      employerRateBps: 0,
      employeeHalalas: 0,
      employerHalalas: 0,
      rateEffectiveFrom: null,
    };
  }

  const rate = input.periods
    .filter((period) => period.scheme === input.scheme && period.effectiveFrom <= input.asOfDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!rate) throw new Error(`No GOSI rate period for ${input.scheme} at ${input.asOfDate}`);

  const contributoryWageHalalas = Math.min(input.contributoryWageHalalas, GOSI_CEILING_HALALAS);
  const sanedEmployee = input.sanedApplicable ? rate.sanedEmployeeRateBps : 0;
  const sanedEmployer = input.sanedApplicable ? rate.sanedEmployerRateBps : 0;
  const employeeRateBps = rate.pensionEmployeeRateBps + sanedEmployee;
  const employerRateBps = rate.pensionEmployerRateBps + sanedEmployer + rate.occupationalEmployerRateBps;

  return {
    scheme: input.scheme,
    contributoryWageHalalas,
    employeeRateBps,
    employerRateBps,
    employeeHalalas: Math.round(contributoryWageHalalas * employeeRateBps / 10_000),
    employerHalalas: Math.round(contributoryWageHalalas * employerRateBps / 10_000),
    rateEffectiveFrom: rate.effectiveFrom,
  };
}
