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
import { MAX_ROUNDS } from "@/experiments/evolution/settings";
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
      kind: z.enum(["choose", "draft"]),
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
    const service = await evolutionService();
    const token = tokenFor(request, code, role);
    if (action?.kind === "draft") {
      await service.saveDraft(code, token, role, { ...action, kind: "draft" });
      return json({ saved: true });
    }
    return json(
      await service.view(
        code,
        token,
        role,
        action,
        z
          .int()
          .min(0)
          .max(MAX_ROUNDS)
          .catch(0)
          .parse(Number(request.nextUrl.searchParams.get("after"))),
        z
          .int()
          .min(1)
          .max(MAX_ROUNDS)
          .catch(MAX_ROUNDS + 1)
          .parse(Number(request.nextUrl.searchParams.get("before"))),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export const GET = handle;
export const POST = handle;
