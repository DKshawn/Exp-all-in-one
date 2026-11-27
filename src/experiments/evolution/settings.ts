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
const DEFAULT_MEMO_ANSWER_SECONDS = "5";
// Reserve half the safe-integer range for clock timestamps and pauses over a full run.
const MAX_MEMO_ANSWER_MS =
  Math.floor(Number.MAX_SAFE_INTEGER / (2 * MEMO_ROUNDS * 3)) - 1000;
export const memoAnswerErrors = [
  "memoAnswerRequired",
  "memoAnswerNumber",
  "memoAnswerPositive",
  "memoAnswerPrecision",
] as const;
export function memoAnswerError(code: string) {
  return memoAnswerErrors.find((error) => error === code);
}

export function parseMemoAnswerTime(input: unknown) {
  if (input === undefined || (typeof input === "string" && !input.trim()))
    return { error: "memoAnswerRequired" } as const;
  // Use the original decimal text so binary floats cannot hide excess precision.
  const match =
    typeof input === "string" &&
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(
      input.trim(),
    );
  if (!match) return { error: "memoAnswerNumber" } as const;
  const [, sign, whole = "", afterWhole, afterDot, exponent = "0"] = match;
  const fraction = afterWhole ?? afterDot ?? "";
  const significant = (whole + fraction).replace(/^0+/, "");
  if (sign === "-" || !significant)
    return { error: "memoAnswerPositive" } as const;
  const digits = significant.replace(/0+$/, "");
  const scale =
    3 + Number(exponent) - fraction.length + significant.length - digits.length;
  if (scale < 0 || digits.length + scale > String(MAX_MEMO_ANSWER_MS).length)
    return { error: "memoAnswerPrecision" } as const;
  const milliseconds = Number(digits) * 10 ** scale;
  if (milliseconds > MAX_MEMO_ANSWER_MS)
    return { error: "memoAnswerPrecision" } as const;
  return { milliseconds } as const;
}

const MEMO_NAMES = ["鹿", "兎"] as const;
export const H5_PROTOCOL = "stag-hunt-neighbors-h5";
export const H5_RADIUS = 5;
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
        memoProtocol: z.enum([MEMO_PROTOCOL, H5_PROTOCOL]).optional(),
        memoOrder: z.enum(MEMO_ORDERS).optional(),
        memoCounterbalance: z.enum(MEMO_INITIAL).optional(),
        memoAnswerSeconds: z
          .string({ error: "memoAnswerNumber" })
          .transform((input, ctx) => {
            const result = parseMemoAnswerTime(input);
            if (result.error) {
              ctx.addIssue({ code: "custom", message: result.error });
              return z.NEVER;
            }
            return String(result.milliseconds / 1000);
          })
          .optional(),
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
      if (s.memoProtocol === MEMO_PROTOCOL && s.memoAnswerSeconds === undefined)
        ctx.addIssue({
          code: "custom",
          path: ["memoAnswerSeconds"],
          message: "memoAnswerRequired",
        });
      if (
        s.memoProtocol &&
        (!s.memoCounterbalance ||
          (s.memoProtocol === H5_PROTOCOL
            ? s.memoOrder !== undefined ||
              s.memoAnswerSeconds !== undefined ||
              s.rounds !== MEMO_ROUNDS ||
              s.groups !== 1
            : !s.memoOrder ||
              s.rounds !== MEMO_ROUNDS * 3 ||
              s.groups !== MEMO_PARTICIPANTS / memoSizes(s.memoOrder)[0]) ||
          s.seconds !== 5 ||
          s.feedbackSeconds !== 1 ||
          s.names[0] !== MEMO_NAMES[0] ||
          s.names[1] !== MEMO_NAMES[1] ||
          JSON.stringify(s.matrix) !== JSON.stringify(MEMO_MATRIX))
      )
        ctx.addIssue({
          code: "custom",
          path: ["memoProtocol"],
          message: "invalid",
        });
      if (
        !s.memoProtocol &&
        (s.memoOrder ||
          s.memoCounterbalance ||
          s.memoAnswerSeconds !== undefined)
      )
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
type BaseMemo = Coordination & {
  memoProtocol: typeof MEMO_PROTOCOL;
  memoOrder: (typeof MEMO_ORDERS)[number];
  memoCounterbalance: (typeof MEMO_INITIAL)[number];
};
type NeighborMemo = Omit<BaseMemo, "memoProtocol" | "memoOrder"> & {
  memoProtocol: typeof H5_PROTOCOL;
  memoOrder?: never;
};
type Memo = BaseMemo | NeighborMemo;
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
  return isMemoV3(s) || isNeighborMemo(s);
}
export function isMemoV3(s: Settings): s is BaseMemo {
  return s.mode === "coordination" && s.memoProtocol === MEMO_PROTOCOL;
}
export function isNeighborMemo(s: Settings): s is NeighborMemo {
  return s.mode === "coordination" && s.memoProtocol === H5_PROTOCOL;
}
export function memoBlockSizes(s: Memo) {
  return isNeighborMemo(s) ? [MEMO_PARTICIPANTS] : memoSizes(s.memoOrder);
}
const memoParameters = {
  mode: "coordination" as const,
  seconds: 5,
  feedbackSeconds: 1,
  matrix: MEMO_MATRIX,
};
export function neighborDefaults(
  initial: Memo["memoCounterbalance"] = "deer",
): NeighborMemo {
  return {
    ...memoParameters,
    names: [...MEMO_NAMES],
    memoProtocol: H5_PROTOCOL,
    memoCounterbalance: initial,
    rounds: MEMO_ROUNDS,
    groups: 1,
  };
}
export const memoAnswerSeconds = (s: BaseMemo) =>
  s.memoAnswerSeconds ?? DEFAULT_MEMO_ANSWER_SECONDS;
export function memoAnswerMilliseconds(s: BaseMemo) {
  // Settings are saved as canonical decimal text with at most three fractional digits.
  const [whole, fraction = ""] = memoAnswerSeconds(s).split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}
export function memoDefaults(
  order: BaseMemo["memoOrder"] = "small-first",
  initial: Memo["memoCounterbalance"] = "deer",
): BaseMemo {
  return {
    ...memoParameters,
    names: [...MEMO_NAMES],
    memoProtocol: MEMO_PROTOCOL,
    memoOrder: order,
    memoCounterbalance: initial,
    rounds: MEMO_ROUNDS * 3,
    memoAnswerSeconds: DEFAULT_MEMO_ANSWER_SECONDS,
    groups: MEMO_PARTICIPANTS / memoSizes(order)[0],
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
