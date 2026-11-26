import { timed } from "@/lib/server/performance";
import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  failure,
  json,
  sessionFor,
  tokenFor,
} from "@/lib/server/http";
import {
  commandSchema,
  MAX_STUDY_COMMAND_BODY_BYTES,
} from "@/experiments/double-auction/server/validation";
import { service } from "@/experiments/double-auction/server/service";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  const receivedAt = Date.now();
  try {
    const code = codeFor((await ctx.params).code);
    const data = await body(
      request,
      commandSchema,
      "application/json",
      MAX_STUDY_COMMAND_BODY_BYTES,
    );
    return json(
      await timed("command.total", async () =>
        (await service()).command(
          code,
          tokenFor(request, code),
          data,
          sessionFor(request),
          receivedAt,
        ),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
