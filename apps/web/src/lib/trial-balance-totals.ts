/** Sum direct account rows, never hierarchy rows that repeat child balances. */
export function totalTrialBalanceRows(
  rows: readonly { totalDebit: number; totalCredit: number }[],
) {
  return rows.reduce((totals, row) => ({
    debit: totals.debit + row.totalDebit,
    credit: totals.credit + row.totalCredit,
    balanceDebit: totals.balanceDebit + Math.max(0, row.totalDebit - row.totalCredit),
    balanceCredit: totals.balanceCredit + Math.max(0, row.totalCredit - row.totalDebit),
  }), { debit: 0, credit: 0, balanceDebit: 0, balanceCredit: 0 });
}
