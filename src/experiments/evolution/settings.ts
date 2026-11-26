import { z } from "zod";
import { add, canonical, compare, validAmount } from "./numbers";

const amount = z.string().trim().max(20).refine(validAmount);
const name = z.string().trim().min(1).max(16);
const pair = z.tuple([amount, amount]);
const row = z.tuple([pair, pair]);
export const MAX_ROUNDS = 10_000;
export const MEMO_ROUNDS = 120;
export const MEMO_LOCK_ROUNDS = 10;
export const MEMO_PARTICIPANTS = 150;
const MEMO_NAMES = ["鹿", "兎"] as const;
export const MEMO_PROTOCOL = "stag-hunt-memo-v3";
export const MEMO_ORDERS = ["small-first", "large-first"] as const;
export const MEMO_INITIAL = ["deer", "hare"] as const;
export function memoSizes(order?: (typeof MEMO_ORDERS)[number]) {
  return order === "large-first" ? [150, 30, 10] : [10, 30, 150];
}
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
  feedbackSeconds: z.int().min(1).max(SETUP_NUMBER_RANGES.feedbackSeconds[1]),
};
export const settingsSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        ...common,
        mode: z.literal("coordination"),
        memoProtocol: z.literal(MEMO_PROTOCOL).optional(),
        memoOrder: z.enum(MEMO_ORDERS).optional(),
        memoCounterbalance: z.enum(MEMO_INITIAL).optional(),
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
    if (
      !isMemo(s) &&
      s.feedbackSeconds < SETUP_NUMBER_RANGES.feedbackSeconds[0]
    )
      ctx.addIssue({
        code: "too_small",
        origin: "number",
        minimum: SETUP_NUMBER_RANGES.feedbackSeconds[0],
        inclusive: true,
        path: ["feedbackSeconds"],
      });
    if (s.mode === "coordination") {
      if (
        s.memoProtocol &&
        (!s.memoOrder ||
          !s.memoCounterbalance ||
          s.rounds !== MEMO_ROUNDS * 3 ||
          s.seconds !== 5 ||
          s.feedbackSeconds !== 1 ||
          s.groups !== MEMO_PARTICIPANTS / memoSizes(s.memoOrder)[0] ||
          s.names[0] !== MEMO_NAMES[0] ||
          s.names[1] !== MEMO_NAMES[1] ||
          JSON.stringify(s.matrix) !== JSON.stringify(MEMO_MATRIX))
      )
        ctx.addIssue({
          code: "custom",
          path: ["memoProtocol"],
          message: "invalid",
        });
      if (!s.memoProtocol && (s.memoOrder || s.memoCounterbalance))
        ctx.addIssue({
          code: "custom",
          path: ["memoProtocol"],
          message: "invalid",
        });
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
type Coordination = Extract<Settings, { mode: "coordination" }>;
type Memo = Coordination & {
  memoProtocol: typeof MEMO_PROTOCOL;
  memoOrder: (typeof MEMO_ORDERS)[number];
  memoCounterbalance: (typeof MEMO_INITIAL)[number];
};
export const MEMO_MATRIX: Coordination["matrix"] = [
  [
    ["4", "4"],
    ["0", "3"],
  ],
  [
    ["3", "0"],
    ["3", "3"],
  ],
];
export function isMemo(s: Settings): s is Memo {
  return s.mode === "coordination" && s.memoProtocol === MEMO_PROTOCOL;
}
export function memoDefaults(
  order: Memo["memoOrder"] = "small-first",
  initial: Memo["memoCounterbalance"] = "deer",
): Memo {
  return {
    mode: "coordination",
    names: [...MEMO_NAMES],
    memoProtocol: MEMO_PROTOCOL,
    memoOrder: order,
    memoCounterbalance: initial,
    rounds: MEMO_ROUNDS * 3,
    seconds: 5,
    feedbackSeconds: 1,
    groups: MEMO_PARTICIPANTS / memoSizes(order)[0],
    matrix: MEMO_MATRIX,
  };
}
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
