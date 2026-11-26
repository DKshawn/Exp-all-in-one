import { GOODS, type GoodId } from "../lib/catalog";
import { repeatSeatPrices } from "../lib/equilibrium";
import type { MarketSettings } from "../lib/types";

export { equilibrium } from "../lib/equilibrium";

// These schedules must never be imported from a client component.
const BASE = {
  apple: { values: [54, 46, 40, 31, 25, 18], costs: [9, 18, 24, 29, 38, 46] },
  banana: { values: [82, 74, 67, 59, 51, 44], costs: [20, 30, 38, 44, 49, 58] },
  orange: {
    values: [105, 93, 83, 65, 55, 40],
    costs: [35, 52, 69, 71, 84, 94],
  },
} satisfies MarketSettings;

export function defaultMarketSettings(): MarketSettings {
  return structuredClone(BASE);
}

export function schedules(capacity: number, base: MarketSettings = BASE) {
  return Object.fromEntries(
    GOODS.map(({ id }) => [
      id,
      {
        values: repeatSeatPrices(base[id].values, capacity / 2).sort(
          (a, b) => b - a,
        ),
        costs: repeatSeatPrices(base[id].costs, capacity / 2).sort(
          (a, b) => a - b,
        ),
      },
    ]),
  ) as MarketSettings;
}

export function limitsForSeat(
  seat: number,
  capacity: number,
  base: MarketSettings = BASE,
) {
  const buyer = seat < capacity / 2;
  const index = (buyer ? seat : seat - capacity / 2) % 6;
  return Object.fromEntries(
    GOODS.map(({ id }) => [id, base[id][buyer ? "values" : "costs"][index]]),
  ) as Record<GoodId, number>;
}
