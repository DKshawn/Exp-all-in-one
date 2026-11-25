import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  aiConsoleCsv,
  aiConsoleOrigin,
  aiConsoleView,
  startAiRun,
  stopAiRun,
} from "@/lib/server/ai-console";
import { body, codeFor, failure, json, NO_STORE } from "@/lib/server/http";
import { teacherAccessKey } from "@/lib/server/teacher-session";
import { AuctionError } from "@/lib/server/errors";

export const runtime = "nodejs";

const idSchema = z.uuid();
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("start"),
      code: z
        .string()
        .trim()
        .regex(/^[a-z2-9]{6}$/i),
      provider: z.enum(["local", "openai"]),
      model: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[^\r\n]+$/),
      count: z.int().min(1).max(999),
      parallel: z.int().min(1).max(999),
      interval: z.int().min(1).max(3600),
      timeout: z.int().min(1).max(300),
      maxOutputTokens: z.int().min(1).max(32768),
    })
    .strict(),
  z.object({ action: z.literal("stop"), id: idSchema }).strict(),
]);

function authorize(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = aiConsoleOrigin(`${request.nextUrl.protocol}//${host}`);
  teacherAccessKey(request);
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AuctionError("この送信元からは操作できません。", 403);
  return origin;
}

function runId(value: string | null) {
  if (value === null) return undefined;
  const id = idSchema.safeParse(value);
  if (!id.success) throw new AuctionError("実行番号を確認してください。");
  return id.data;
}

export async function GET(request: NextRequest) {
  try {
    authorize(request);
    const exportId = runId(request.nextUrl.searchParams.get("export"));
    if (exportId) {
      const { content, name } = await aiConsoleCsv(exportId);
      return new Response(content, {
        headers: {
          ...NO_STORE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
        },
      });
    }
    return json(
      await aiConsoleView(runId(request.nextUrl.searchParams.get("run"))),
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = authorize(request);
    const data = await body(request, input);
    if (data.action === "stop") {
      stopAiRun(data.id);
      return json(await aiConsoleView(data.id));
    }
    const run = await startAiRun({ ...data, code: codeFor(data.code) }, origin);
    return json(await aiConsoleView(run.id), 201);
  } catch (error) {
    return failure(error);
  }
}
