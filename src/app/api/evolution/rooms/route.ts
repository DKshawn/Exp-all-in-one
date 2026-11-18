import { z } from "zod";
import type { NextRequest } from "next/server";
import { body, failure, loginResponse } from "@/lib/server/http";
import { teacherAccessKey } from "@/lib/server/teacher-session";
import { evolutionService } from "@/experiments/evolution/server/service";
import { settingsSchema } from "@/experiments/evolution/settings";
const schema = z
  .object({
    title: z.string().trim().min(1).max(60),
    password: z.string().min(8).max(128),
    accessKey: z.string().max(256).optional(),
    settings: settingsSchema,
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    const data = await body(request, schema);
    const key = teacherAccessKey(request, data.accessKey);
    return loginResponse(
      request,
      await (
        await evolutionService()
      ).create(data.title, data.password, key, data.settings),
      "teacher",
    );
  } catch (e) {
    return failure(e);
  }
}
