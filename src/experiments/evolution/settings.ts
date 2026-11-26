import { z } from "zod";
import { add, canonical, compare, validAmount } from "./numbers";

const amount = z.string().trim().max(20).refine(validAmount);
const name = z.string().trim().min(1).max(16);
const pair = z.tuple([amount, amount]);
const row = z.tuple([pair, pair]);
export const MAX_ROUNDS = 10_000;
export const DEMAND_STEPS = 1000;
export const DEMAND_STEP_OPTIONS = ["0.1", "0.01", "0.005", "0.001"] as const;
export const DEFAULT_DEMAND_STEP = DEMAND_STEP_OPTIONS[0];
export const HISTORY_ROUNDS = 20;
export const SETUP_NUMBER_RANGES = {
  groups: [1, 32],
  rounds: [1, MAX_ROUNDS],
  seconds: [5, 600],
  feedbackSeconds: [3, 120],
} as const;
const integerIn = ([min, max]: readonly [number, number]) =>
  z.int().min(min).max(max);

const common = {
  groups: integerIn(SETUP_NUMBER_RANGES.groups),
  rounds: integerIn(SETUP_NUMBER_RANGES.rounds),
  seconds: integerIn(SETUP_NUMBER_RANGES.seconds),
  feedbackSeconds: integerIn(SETUP_NUMBER_RANGES.feedbackSeconds),
};
export const settingsSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        ...common,
        mode: z.literal("coordination"),
        names: z.tuple([name, name]),
        matrix: z.tuple([row, row]),
      })
      .strict(),
    z
      .object({
        ...common,
        mode: z.literal("demand"),
        total: amount,
        options: z.array(amount).min(2).max(12).optional(),
        demandStep: z.enum(DEMAND_STEP_OPTIONS).optional(),
      })
      .strict(),
  ])
  .superRefine((s, ctx) => {
    if (s.mode === "coordination") {
      if (s.names[0] === s.names[1])
        ctx.addIssue({ code: "custom", path: ["names"], message: "distinct" });
    } else if (!s.options) {
      if (s.total !== "1")
        ctx.addIssue({ code: "custom", path: ["total"], message: "range" });
    } else if (s.demandStep !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["demandStep"],
        message: "discrete",
      });
    } else if ([s.total, ...s.options].every(validAmount)) {
      if (
        compare(s.total, "0") <= 0 ||
        s.options.some((x) => compare(x, "0") < 0 || compare(x, s.total) > 0) ||
        new Set(s.options.map(canonical)).size !== s.options.length
      )
        ctx.addIssue({ code: "custom", path: ["options"], message: "range" });
    }
  });
export type Settings = z.infer<typeof settingsSchema>;
export type Mode = Settings["mode"];
export type DemandStep = (typeof DEMAND_STEP_OPTIONS)[number];
type Demand = Extract<Settings, { mode: "demand" }>;
export const defaults = (mode: Mode): Settings => {
  const common = { groups: 1, rounds: 10, seconds: 30, feedbackSeconds: 8 };
  return mode === "demand"
    ? { ...common, mode, total: "1", demandStep: DEFAULT_DEMAND_STEP }
    : {
        ...common,
        mode,
        names: ["鹿", "兎"],
        matrix: [
          [
            ["4", "4"],
            ["0", "3"],
          ],
          [
            ["3", "0"],
            ["2", "2"],
          ],
        ],
      };
};
export const choices = (s: Settings) =>
  s.mode === "coordination" ? s.names : (s.options ?? []);
export const continuous = (
  s: Settings,
): s is Demand & { options?: undefined } => s.mode === "demand" && !s.options;
// Slider choices stay in integer thousandths, including older rooms without a step.
export const demandStep = (s: Demand) => s.demandStep ?? "0.001";
export const choiceStride = (s: Settings) =>
  continuous(s) ? Math.round(Number(demandStep(s)) * DEMAND_STEPS) : 1;
export const choiceCount = (s: Settings) =>
  continuous(s) ? DEMAND_STEPS / choiceStride(s) + 1 : choices(s).length;
export const demandLabel = (choice: number) => String(choice / DEMAND_STEPS);
export const demandBand = (choice: number) =>
  Math.min(9, Math.floor((10 * choice) / DEMAND_STEPS));
export function outcome(s: Settings, left: number, right: number) {
  if (s.mode === "coordination")
    return {
      pay: s.matrix[left][right].map(canonical),
      agreement: left === right,
    };
  if (!s.options) {
    const agreement = left + right <= DEMAND_STEPS;
    return {
      pay: agreement
        ? [canonical(demandLabel(left)), canonical(demandLabel(right))]
        : ["0", "0"],
      agreement,
    };
  }
  const a = s.options[left],
    b = s.options[right];
  const agreement = compare(add(a, b), s.total) <= 0;
  return {
    pay: agreement ? [canonical(a), canonical(b)] : ["0", "0"],
    agreement,
  };
}
