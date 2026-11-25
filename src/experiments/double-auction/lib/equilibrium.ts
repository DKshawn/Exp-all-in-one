import type { Equilibrium } from "./types";

export function repeatSeatPrices(prices: number[], seats: number) {
  return Array.from({ length: seats }, (_, i) => prices[i % prices.length]);
}

// Pure calculation: this module contains no private experiment settings.
export function equilibrium(values: number[], costs: number[]): Equilibrium {
  const v = [...values].sort((a, b) => b - a);
  const c = [...costs].sort((a, b) => a - b);
  const count = Math.min(v.length, c.length);
  let quantity = 0;
  let surplus = 0;
  while (quantity < count && v[quantity] > c[quantity]) {
    surplus += v[quantity] - c[quantity];
    quantity++;
  }
  // Zero-surplus marginal trades make equilibrium quantity a range.
  let quantityMax = quantity;
  while (quantityMax < count && v[quantityMax] === c[quantityMax])
    quantityMax++;
  return {
    low: Math.max(c[quantity - 1] ?? 0, v[quantity] ?? 0),
    high: Math.min(v[quantity - 1] ?? Infinity, c[quantity] ?? Infinity),
    quantity,
    quantityMax,
    surplus,
  };
}

export function equilibriumQuantity(eq: Equilibrium) {
  return eq.quantity === eq.quantityMax
    ? String(eq.quantity)
    : `${eq.quantity}〜${eq.quantityMax}`;
}
