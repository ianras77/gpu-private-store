export type NormalizedChartValues = { values: number[]; minimum: number; maximum: number; range: number };

/** Scales chart coordinates before subtraction so large finite data stays drawable. */
export function normalizeChartValues(values: number[]): NormalizedChartValues | null {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  const magnitude = Math.max(...values.map(Math.abs));
  const scaled = values.map((value) => magnitude === 0 ? 0 : value / magnitude);
  const minimum = Math.min(0, ...scaled);
  const maximum = Math.max(0, ...scaled);
  return { values: scaled, minimum, maximum, range: maximum - minimum || 1 };
}

/** Computes pie proportions without summing values at their original scale. */
export function pieChartProportions(values: number[]): number[] | null {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const magnitude = Math.max(...values);
  if (magnitude <= 0) return null;
  const scaled = values.map((value) => value / magnitude);
  const total = scaled.reduce((sum, value) => sum + value, 0);
  return Number.isFinite(total) && total > 0 ? scaled.map((value) => value / total) : null;
}
