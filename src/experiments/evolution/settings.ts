import { z } from "zod";
import { add, canonical, compare, validAmount } from "./numbers";

const amount = z.string().trim().max(20).refine(validAmount);
const name = z.string().trim().min(1).max(16);
const pair = z.tuple([amount, amount]);
const row = z.tuple([pair, pair]);
const common = {
  groups: z.int().min(1).max(32),
  rounds: z.int().min(1).max(100),
  seconds: z.int().min(5).max(600),
  feedbackSeconds: z.int().min(3).max(120),
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
        options: z.array(amount).min(2).max(12),
      })
      .strict(),
  ])
  .superRefine((s, ctx) => {
    if (s.mode === "coordination") {
      if (s.names[0] === s.names[1])
        ctx.addIssue({ code: "custom", path: ["names"], message: "distinct" });
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
export const defaults = (mode: Mode): Settings => {
  const common = { groups: 1, rounds: 10, seconds: 30, feedbackSeconds: 8 };
  return mode === "demand"
    ? { ...common, mode, total: "1", options: ["1/3", "1/2", "2/3"] }
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
  s.mode === "coordination" ? s.names : s.options;
export function outcome(s: Settings, left: number, right: number) {
  if (s.mode === "coordination")
    return {
      pay: s.matrix[left][right].map(canonical),
      agreement: left === right,
    };
  const a = s.options[left],
    b = s.options[right];
  const agreement = compare(add(a, b), s.total) <= 0;
  return {
    pay: agreement ? [canonical(a), canonical(b)] : ["0", "0"],
    agreement,
  };
}
