import { experimentFor } from "@/lib/server/experiment-registry";
import { evolutionService } from "@/experiments/evolution/server/service";
import { emhService } from "@/experiments/emh/server/service";
import { judgmentService } from "@/experiments/judgment/server/service";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { body, codeFor, failure, loginResponse } from "@/lib/server/http";
import { service } from "@/experiments/double-auction/server/service";

export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const { password } = await body(
      request,
      z.object({ password: z.string().min(8).max(128) }).strict(),
    );
    const experiment = await experimentFor(code);
    if (experiment === "evolution")
      return loginResponse(
        request,
        await (
          await evolutionService()
        ).login(code, { role: "teacher", password }),
        "teacher",
      );
    if (experiment === "judgment")
      return loginResponse(
        request,
        await (
          await judgmentService()
        ).login(code, { role: "teacher", password }),
        "teacher",
      );
    if (experiment === "emh")
      return loginResponse(
        request,
        await (await emhService()).login(code, { role: "teacher", password }),
        "teacher",
      );
    return loginResponse(
      request,
      await (await service()).recoverTeacher(code, password),
      "teacher",
    );
  } catch (error) {
    return failure(error);
  }
}
