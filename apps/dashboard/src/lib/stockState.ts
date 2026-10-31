/**
 * Stock status of one variant, with the same rule as the API's low-stock filter and the
 * dashboard count: out at zero or below, low at or below its alert level.
 */
export type StockState = "ok" | "low" | "out";

export const STOCK_STATE_LABEL: Record<StockState, string> = {
  ok: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

export function stockStateOf(
  quantity: number | string | null | undefined,
  minStock: number | string | null | undefined,
): StockState {
  const q = Number(quantity) || 0;
  if (q <= 0) return "out";
  if (minStock != null && q <= Number(minStock)) return "low";
  return "ok";
}
