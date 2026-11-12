import { z } from "zod";
import type { NextRequest } from "next/server";
import { AuctionError } from "@/lib/server/errors";
import { sessionFor } from "@/lib/server/http";
import { DEFAULT_SETTINGS, EXP2_SETTINGS, settingsSchema } from "../settings";

export const createSchema = z
  .object({
    title: z.string().trim().min(1).max(60),
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).default(""),
    experiment: z.enum(["exp1", "exp2"]).default("exp1"),
    settings: settingsSchema.optional(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    settings:
      value.settings ??
      structuredClone(
        value.experiment === "exp2" ? EXP2_SETTINGS : DEFAULT_SETTINGS,
      ),
  }));
const side = z.enum(["bid", "ask"]);
const unitKey = z.string().min(1).max(80);
const action = z.union([
  z
    .object({
      kind: z.literal("quote"),
      side,
      price: z.number().int().min(1).max(100000),
      unitKey,
    })
    .strict(),
  z
    .object({
      kind: z.enum(["accept", "cancel"]),
      side,
      quoteId: z.string().min(1).max(100),
      unitKey,
    })
    .strict(),
  z
    .object({
      kind: z.enum(["pause", "resume", "end-period", "next-year", "reveal"]),
      expectedPhase: z.string().min(1).max(100),
    })
    .strict(),
]);
export const commandSchema = z.discriminatedUnion("scope", [
  z
    .object({
      requestId: z.uuid(),
      scope: z.literal("session"),
      command: z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.enum([
              "assign",
              "reopen",
              "start",
              "pause-all",
              "resume-all",
              "finish-all",
              "reveal-all",
            ]),
            expectedRevision: z.number().int().min(0),
          })
          .strict(),
        z
          .object({
            kind: z.literal("update-settings"),
            expectedRevision: z.number().int().min(0),
            settings: settingsSchema,
          })
          .strict(),
      ]),
    })
    .strict(),
  z
    .object({
      requestId: z.uuid(),
      scope: z.literal("market"),
      marketId: z.number().int().min(1).max(999),
      action,
    })
    .strict(),
]);
export function requestScope(request: NextRequest) {
  const role = sessionFor(request) ?? "student";
  const value = request.nextUrl.searchParams.get("market");
  if (value !== null && !/^[1-9]\d{0,2}$/.test(value))
    throw new AuctionError("市場番号を確認してください。", 400);
  return { role, market: value === null ? undefined : Number(value) };
}
