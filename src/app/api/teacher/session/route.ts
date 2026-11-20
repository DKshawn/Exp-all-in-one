import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  body,
  failure,
  FORM_CONTENT_TYPE,
  json,
  NO_STORE,
} from "@/lib/server/http";
import { AuctionError } from "@/lib/server/errors";
import {
  createTeacherSession,
  teacherReturnPath,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_SECONDS,
} from "@/lib/server/teacher-session";

export const runtime = "nodejs";
const loginSchema = z.object({ accessKey: z.string().max(256) }).strict();
const formSchema = loginSchema.extend({
  next: z.string().max(1024).optional(),
});

function redirectAfterPost(location: string) {
  return new NextResponse(null, {
    status: 303,
    headers: { ...NO_STORE, Location: location },
  });
}

export async function POST(request: NextRequest) {
  const form = request.headers
    .get("content-type")
    ?.startsWith(FORM_CONTENT_TYPE);
  let returnTo = "/teacher";
  try {
    const credentials = form
      ? await body(request, formSchema, FORM_CONTENT_TYPE)
      : await body(request, loginSchema);
    if ("next" in credentials && typeof credentials.next === "string")
      returnTo = teacherReturnPath(credentials.next);
    const token = createTeacherSession(credentials.accessKey);
    const response = form
      ? redirectAfterPost(returnTo)
      : json({ authenticated: true });
    response.cookies.set(TEACHER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: TEACHER_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    if (form && error instanceof AuctionError) {
      const query = new URLSearchParams({ next: returnTo, failed: "1" });
      return redirectAfterPost(`/teacher/login?${query}`);
    }
    return failure(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await body(request, z.object({}).strict());
    const response = json({ authenticated: false });
    response.cookies.set(TEACHER_SESSION_COOKIE, "", {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return failure(error);
  }
}
