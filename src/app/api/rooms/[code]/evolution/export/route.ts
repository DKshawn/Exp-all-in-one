import type { NextRequest } from "next/server";
import { codeFor, failure, NO_STORE, tokenFor } from "@/lib/server/http";
import { evolutionService } from "@/experiments/evolution/server/service";
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const code = codeFor((await ctx.params).code),
      format =
        request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
    const data = await (
      await evolutionService()
    ).export(code, tokenFor(request, code, "teacher"), format);
    return new Response(data, {
      headers: {
        ...NO_STORE,
        "Content-Type":
          format === "json"
            ? "application/json; charset=utf-8"
            : "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="evolution-' +
          code +
          "-" +
          (format === "csv" ? "responses" : "research") +
          "." +
          format +
          '"',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
