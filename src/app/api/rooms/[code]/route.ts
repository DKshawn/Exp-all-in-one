import { experimentFor } from "@/lib/server/experiment-registry";
import { evolutionService } from "@/experiments/evolution/server/service";
import { emhService } from "@/experiments/emh/server/service";
import { judgmentService } from "@/experiments/judgment/server/service";
import type { NextRequest } from "next/server";
import {
  body,
  codeFor,
  deleteRoomSchema,
  failure,
  json,
  roomViewResponse,
  sessionFor,
  tokenFor,
} from "@/lib/server/http";
import { service } from "@/experiments/double-auction/server/service";
import { teacherAccessKey } from "@/lib/server/teacher-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    return roomViewResponse(
      request,
      await (
        await service()
      ).view(code, tokenFor(request, code), sessionFor(request)),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code);
    const data = await body(request, deleteRoomSchema);
    const accessKey = teacherAccessKey(request, data.accessKey);
    const experiment = await experimentFor(code);
    if (experiment === "evolution")
      await (await evolutionService()).deleteRoom(code, accessKey);
    else if (experiment === "judgment")
      await (await judgmentService()).deleteRoom(code, accessKey);
    else if (experiment === "emh")
      await (await emhService()).deleteRoom(code, accessKey);
    else await (await service()).deleteRoom(code, accessKey);
    return json({ deleted: code });
  } catch (error) {
    return failure(error);
  }
}
