import { z } from "zod";
import { MAX_ROOM_PARTICIPANTS } from "@/lib/participant-config";

export const MIN_MARKET_SIZE = 3;
export const MAX_MARKET_SIZE = 12;
export const MAX_EXP2_MARKET_SIZE = 999;
export const MAX_EXP2_MARKETS = Math.floor(
  MAX_ROOM_PARTICIPANTS / MIN_MARKET_SIZE,
);
export const exp2OptionsSchema = z
  .object({
    emptyUnitsLimit: z.number().int().min(1).max(100),
    insiderStartRound: z.number().int().min(1).max(7),
    insiderCountPerType: z.number().int().min(0).max(MAX_EXP2_MARKET_SIZE),
    marketCount: z.number().int().min(1).max(MAX_EXP2_MARKETS).nullable(),
    states: z
      .object({
        prior: z
          .tuple([
            z.number().min(0).max(1),
            z.number().min(0).max(1),
            z.number().min(0).max(1),
          ])
          .refine(
            (values) =>
              Math.abs(values.reduce((sum, n) => sum + n, 0) - 1) < 0.000001,
            "状態の確率の合計は100%にしてください。",
          ),
        dividends: z.tuple([
          z.tuple([
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
          ]),
          z.tuple([
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
          ]),
          z.tuple([
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
            z.number().int().min(0).max(100000),
          ]),
        ]),
        // Accepted only for old saved settings; new experiments draw their states.
        outcomes: z
          .tuple([
            z.number().int().min(1).max(3),
            z.number().int().min(1).max(3),
            z.number().int().min(1).max(3),
            z.number().int().min(1).max(3),
            z.number().int().min(1).max(3),
            z.number().int().min(1).max(3),
          ])
          .optional(),
      })
      .strict()
      .transform(({ prior, dividends }) => ({ prior, dividends })),
  })
  .strict();
export type Exp2Options = z.infer<typeof exp2OptionsSchema>;
export const settingsSchema = z
  .object({
    initialUnits: z.number().int().min(1).max(20),
    targetMarketSize: z
      .number()
      .int()
      .min(MIN_MARKET_SIZE)
      .max(MAX_EXP2_MARKET_SIZE),
    typeRatios: z.tuple([
      z.number().int().min(1).max(100),
      z.number().int().min(1).max(100),
      z.number().int().min(1).max(100),
    ]),
    periodSeconds: z.number().int().min(60).max(1800),
    rounds: z.number().int().min(1).max(12).default(6),
    unitSeconds: z.number().int().min(1).max(1800).default(30),
    breakSeconds: z.number().int().min(1).max(1800).default(60),
    exp2: exp2OptionsSchema.optional(),
  })
  .strict()
  .refine(
    (settings) =>
      settings.exp2 !== undefined ||
      settings.targetMarketSize <= MAX_MARKET_SIZE,
    {
      message: "実験1の1市場の目標人数は3〜12人です。",
      path: ["targetMarketSize"],
    },
  );
export type EmhSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 9,
  typeRatios: [1, 1, 1],
  periodSeconds: 240,
  rounds: 6,
  unitSeconds: 30,
  breakSeconds: 60,
};
export const EXP2_SETTINGS: EmhSettings = {
  initialUnits: 2,
  targetMarketSize: 12,
  typeRatios: [1, 1, 1],
  periodSeconds: 300,
  rounds: 6,
  unitSeconds: 30,
  breakSeconds: 60,
};

// Rooms saved before configurable conditions retain the original protocol.
export function initialUnitsFor(config: { initialUnits?: number }) {
  return config.initialUnits ?? DEFAULT_SETTINGS.initialUnits;
}

export function settingsForExperiment(
  input: EmhSettings,
  experiment: "exp1" | "exp2",
): EmhSettings {
  const settings = settingsSchema.parse(input);
  if (experiment === "exp2") {
    if (settings.rounds > 6)
      throw new Error("実験2は1〜6ラウンドで設定してください。");
    return settings;
  }
  const exp1 = { ...settings };
  delete exp1.exp2;
  return settingsSchema.parse(exp1);
}
