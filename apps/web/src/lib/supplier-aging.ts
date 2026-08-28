export interface SupplierObligation {
  date: string;
  amountHalalas: number;
}

export interface SupplierAgingBuckets {
  current: number;
  days31_60: number;
  days61_90: number;
  days91plus: number;
  unallocated: number;
  total: number;
}

function daysBetween(asOf: string, date: string): number {
  const end = new Date(`${asOf}T00:00:00Z`).getTime();
  const start = new Date(`${date}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/**
 * Allocate a supplier's open balance to its newest obligations. This is the
 * remaining-lot view after FIFO settlement: older obligations are consumed first,
 * so the unpaid balance sits on the newest still-open obligations.
 *
 * Any balance that cannot be traced to an invoice obligation is surfaced as
 * `unallocated`; it is never presented as a current debt with a fabricated age.
 */
export function allocateSupplierBalanceByAge(
  balanceHalalas: number,
  obligations: SupplierObligation[],
  asOf: string,
): SupplierAgingBuckets {
  const total = Math.max(0, Math.trunc(balanceHalalas));
  const result: SupplierAgingBuckets = {
    current: 0,
    days31_60: 0,
    days61_90: 0,
    days91plus: 0,
    unallocated: 0,
    total,
  };

  let remaining = total;
  const newestFirst = obligations
    .filter((item) => item.amountHalalas > 0 && item.date <= asOf)
    .toSorted((a, b) => b.date.localeCompare(a.date));

  for (const item of newestFirst) {
    if (remaining <= 0) break;
    const allocated = Math.min(remaining, Math.trunc(item.amountHalalas));
    const age = daysBetween(asOf, item.date);
    if (age <= 30) result.current += allocated;
    else if (age <= 60) result.days31_60 += allocated;
    else if (age <= 90) result.days61_90 += allocated;
    else result.days91plus += allocated;
    remaining -= allocated;
  }

  result.unallocated = remaining;
  return result;
}

/** Split an exact control-account movement across suppliers without rounding drift. */
export function allocateProRata(
  totalHalalas: number,
  weights: Map<string, number>,
): Map<string, number> {
  const positive = [...weights.entries()].filter(([, weight]) => weight > 0);
  const weightTotal = positive.reduce((sum, [, weight]) => sum + weight, 0);
  const allocation = new Map<string, number>();
  if (totalHalalas <= 0 || weightTotal <= 0) return allocation;

  // Largest-remainder allocation keeps every supplier amount non-negative and
  // preserves the exact control-account total. Independent Math.round calls can
  // over-assign the early rows and leave a negative amount for the last supplier.
  const shares = positive.map(([id, weight], index) => {
    const exact = totalHalalas * weight / weightTotal;
    return { id, index, amount: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const centsLeft = totalHalalas - shares.reduce((sum, share) => sum + share.amount, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < centsLeft; index++) byRemainder[index]!.amount += 1;
  for (const share of shares) allocation.set(share.id, share.amount);
  return allocation;
}
