/**
 * Time-series projection helpers — pure functions, no I/O.
 *
 * Used by admin views to project costs, revenue, and impact forward
 * over multiple years using growth rates from country data.
 */

/** Project a base value forward N years at a constant annual growth rate. */
export function projectYearly(baseValue: number, annualGrowthRate: number, years: number): number[] {
  const result: number[] = [];
  let value = baseValue;
  for (let i = 0; i < years; i++) {
    value = i === 0 ? baseValue : value * (1 + annualGrowthRate);
    result.push(Math.round(value * 100) / 100);
  }
  return result;
}

/** Generate year labels: "Year 1", "Year 2", etc. */
export function yearLabels(years: number): string[] {
  return Array.from({ length: years }, (_, i) => `Year ${i + 1}`);
}
