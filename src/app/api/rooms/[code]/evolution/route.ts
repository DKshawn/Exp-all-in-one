import { z } from "zod";
import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  failure,
  json,
  sessionFor,
  tokenFor,
} from "@/lib/server/http";
import { evolutionService } from "@/experiments/evolution/server/service";
const schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("close"),
      revision: z.int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("start"),
      revision: z.int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["timerPause", "timerResume", "timerReset", "reopen"]),
      revision: z.int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("timerStart"),
      seconds: z.int().min(5).max(3600),
      revision: z.int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("setGroups"),
      groups: z.int().min(1).max(32),
      revision: z.int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["pause", "resume", "advance", "shorten", "end"]),
      round: z.int().positive(),
      phase: z.enum(["playing", "feedback"]),
      revision: z.int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("choose"),
      round: z.int().positive(),
      choice: z.int().nonnegative(),
    })
    .strict(),
]);
type Context = { params: Promise<{ code: string }> };
async function handle(request: NextRequest, ctx: Context) {
  try {
    const code = codeFor((await ctx.params).code),
      role = sessionFor(request) ?? "student";
    const action =
      request.method === "POST" ? await body(request, schema) : undefined;
    return json(
      await (
        await evolutionService()
      ).view(code, tokenFor(request, code, role), role, action),
    );
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
