import type { NextRequest } from "next/server";
import { studyAdmissionSeatsRemaining } from "@/experiments/double-auction/lib/study-config";
import { service } from "@/experiments/double-auction/server/service";
import { studyAiAdmissionSchema } from "@/experiments/double-auction/server/validation";
import { aiConsoleOrigin, prepareAiAdmission } from "@/lib/server/ai-console";
import { AuctionError } from "@/lib/server/errors";
import { body, codeFor, failure, json, tokenFor } from "@/lib/server/http";
import { teacherAccessKey } from "@/lib/server/teacher-session";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const origin = aiConsoleOrigin(request);
    teacherAccessKey(request);
    const code = codeFor((await ctx.params).code);
    const admission = await body(request, studyAiAdmissionSchema);
    const view = await (
      await service()
    ).view(code, tokenFor(request, code, "teacher"), "teacher");
    if (
      view.phase !== "waiting" ||
      view.study?.lobby?.admission?.status !== "open" ||
      !view.study.teacher
    )
      throw new AuctionError("入室受付中のルームを選んでください。", 409);
    const remaining = studyAdmissionSeatsRemaining(
      view.study.teacher.participants.length,
    );
    if (admission.count > remaining)
      throw new AuctionError(
        `入室できる残り人数は ${remaining} 人です。AI 人数を減らしてください。`,
      );
    const enroll = prepareAiAdmission(admission, origin, "institutions");
    return json(await enroll(code), 201);
  } catch (error) {
    return failure(error);
  }
}
