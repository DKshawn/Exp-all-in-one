import { MAX_ROOM_PARTICIPANTS } from "@/lib/participant-config";
import type { Allocation } from "./session-types";
import {
  DEFAULT_SETTINGS,
  MAX_MARKET_SIZE,
  MAX_EXP2_MARKET_SIZE,
  MIN_MARKET_SIZE,
  settingsSchema,
  type EmhSettings,
} from "./settings";

export const MAX_PARTICIPANTS = MAX_ROOM_PARTICIPANTS;
export function allocationPlan(
  attendance: number,
  input: EmhSettings = DEFAULT_SETTINGS,
): Allocation[] {
  if (
    !Number.isInteger(attendance) ||
    attendance < 0 ||
    attendance > MAX_PARTICIPANTS
  )
    throw new Error("参加者数を確認してください。");
  const settings = settingsSchema.parse(input);
  if (attendance < MIN_MARKET_SIZE) return [];
  const maxMarketSize = settings.exp2 ? MAX_EXP2_MARKET_SIZE : MAX_MARKET_SIZE;
  let count =
    settings.exp2?.marketCount ??
    Math.max(
      1,
      Math.min(
        Math.round(attendance / settings.targetMarketSize),
        Math.floor(attendance / MIN_MARKET_SIZE),
      ),
    );
  if (settings.exp2?.marketCount != null) {
    if (
      attendance < count * MIN_MARKET_SIZE ||
      attendance > count * maxMarketSize
    )
      return [];
  } else if (Math.ceil(attendance / count) > maxMarketSize) count++;
  const weights = settings.typeRatios;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const totals = [0, 0, 0];
  let allocated = 0;
  return Array.from({ length: count }, (_, index) => {
    const size =
      Math.floor(attendance / count) + (index < attendance % count ? 1 : 0);
    // Every type has a seat. Allocate remaining seats to the largest quota
    // deficit; ties favor the type underrepresented across earlier markets.
    const typeCounts = [1, 1, 1];
    for (let seat = 3; seat < size; seat++) {
      const order = [0, 1, 2].sort((a, b) => {
        const local =
          size * weights[b]! -
          typeCounts[b]! * weightSum -
          (size * weights[a]! - typeCounts[a]! * weightSum);
        const global =
          (allocated + size) * weights[b]! -
          (totals[b]! + typeCounts[b]!) * weightSum -
          ((allocated + size) * weights[a]! -
            (totals[a]! + typeCounts[a]!) * weightSum);
        return local || global || a - b;
      });
      typeCounts[order[0]!]++;
    }
    typeCounts.forEach((n, i) => {
      totals[i] += n;
    });
    allocated += size;
    return { id: index + 1, size, typeCounts };
  });
}
