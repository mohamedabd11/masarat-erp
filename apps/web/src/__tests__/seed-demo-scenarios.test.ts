import { describe, expect, it } from 'vitest';

import {
  HISTORICAL_DEMO_SCENARIOS,
  historicalScenarioDate,
} from '../../scripts/seed-demo-scenarios';

describe('historical demo scenario matrix', () => {
  it('spans eight distinct prior months with stable dates', () => {
    const dates = HISTORICAL_DEMO_SCENARIOS.map((scenario) =>
      historicalScenarioDate('2026-09-01', scenario));

    expect(dates).toEqual([
      '2026-01-10', '2026-02-12', '2026-03-14', '2026-04-16',
      '2026-05-18', '2026-06-20', '2026-07-22', '2026-08-24',
    ]);
    expect(new Set(dates.map((date) => date.slice(0, 7))).size).toBe(8);
  });

  it('covers business roles, customers, payment states, methods, and service families', () => {
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.map((s) => s.key)).size).toBe(8);
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.map((s) => s.revenueModel))).toEqual(new Set(['agent', 'principal']));
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.map((s) => s.customer))).toEqual(new Set(['individual', 'company']));
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.map((s) => s.payment.state))).toEqual(new Set(['full', 'partial', 'none']));
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.flatMap((s) => s.payment.state === 'none' ? [] : [s.payment.method])))
      .toEqual(new Set(['cash', 'bank_transfer', 'card']));
    expect(new Set(HISTORICAL_DEMO_SCENARIOS.map((s) => s.serviceType)).size).toBe(6);
  });

  it('keeps every standard-rated VAT amount aligned with the accounting model', () => {
    for (const scenario of HISTORICAL_DEMO_SCENARIOS) {
      expect(Number.isInteger(scenario.priceExclVatHalalas)).toBe(true);
      expect(Number.isInteger(scenario.costHalalas)).toBe(true);
      expect(Number.isInteger(scenario.vatHalalas)).toBe(true);
      expect(scenario.priceExclVatHalalas).toBeGreaterThanOrEqual(scenario.costHalalas);

      if (scenario.vatCategory === 'S') {
        const taxableBase = scenario.revenueModel === 'agent'
          ? scenario.priceExclVatHalalas - scenario.costHalalas
          : scenario.priceExclVatHalalas;
        expect(scenario.vatHalalas).toBe(Math.round(taxableBase * 0.15));
      } else {
        expect(scenario.vatHalalas).toBe(0);
      }

      if (scenario.payment.state === 'partial') {
        expect(scenario.payment.amountHalalas).toBeGreaterThan(0);
        expect(scenario.payment.amountHalalas)
          .toBeLessThan(scenario.priceExclVatHalalas + scenario.vatHalalas);
      }
    }
  });
});
