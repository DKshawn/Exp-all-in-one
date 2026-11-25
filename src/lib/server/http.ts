import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuctionError } from "./errors";
import { MAX_NICKNAME_LENGTH } from "../participant-config";
import type { RoomSession } from "../room-session";

export const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};
export const MAX_JSON_BODY_BYTES = 128 * 1024;
export const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded";
export const cookieName = (code: string, session?: RoomSession) =>
  `auction_${code}${session ? `_${session}` : ""}`;

export function sessionFor(request: NextRequest): RoomSession | undefined {
  const session = request.nextUrl.searchParams.get("session");
  if (session === null) return undefined;
  if (session === "teacher" || session === "student") return session;
  throw new AuctionError("入室する役割が正しくありません。");
}

export function tokenFor(
  request: NextRequest,
  code: string,
  session = sessionFor(request),
) {
  const teacher = request.cookies.get(cookieName(code, "teacher"))?.value;
  const student = request.cookies.get(cookieName(code, "student"))?.value;
  if (session) {
    const token = session === "teacher" ? teacher : student;
    // Once separate sessions exist, never fall back to the other role or to
    // the old shared cookie. A missing role must sign in using that role.
    if (teacher !== undefined || student !== undefined) return token;
  } else if (student !== undefined || teacher !== undefined) {
    return student ?? teacher;
  }
  return request.cookies.get(cookieName(code))?.value;
}

export function codeFor(code: string) {
  const cleaned = code.toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(cleaned))
    throw new AuctionError("ルームコードは 6 文字で入力してください。");
  return cleaned;
}

export async function body<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  contentType:
    "application/json" | typeof FORM_CONTENT_TYPE = "application/json",
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<T> {
  const origin = request.headers.get("origin");
  if (origin || contentType === FORM_CONTENT_TYPE) {
    let sameOrigin = false;
    try {
      const source = new URL(origin ?? "");
      // NextURL normalizes loopback hostnames; Host retains the actual browser
      // origin. Browsers cannot replace Host in a cross-origin request.
      sameOrigin =
        source.host === (request.headers.get("host") || request.nextUrl.host) &&
        source.protocol === request.nextUrl.protocol;
    } catch {
      /* Invalid origins are rejected. */
    }
    if (!sameOrigin)
      throw new AuctionError("この送信元からは操作できません。", 403);
  }
  if (!request.headers.get("content-type")?.startsWith(contentType))
    throw new AuctionError("送信形式が正しくありません。", 415);
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new AuctionError("送信内容が大きすぎます。", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes)
    throw new AuctionError("送信内容が大きすぎます。", 413);
  let data: unknown;
  try {
    data =
      contentType === FORM_CONTENT_TYPE
        ? Object.fromEntries(new URLSearchParams(text))
        : JSON.parse(text);
  } catch {
    throw new AuctionError("送信内容を読み取れません。");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    // Preserve the generator's precise range/integer diagnosis on creation too.
    const generatorIssue = parsed.error.issues.find(
      (issue) =>
        issue.code === "custom" &&
        issue.path.length === 1 &&
        issue.path[0] === "generator",
    );
    throw new AuctionError(
      generatorIssue?.message ??
        "入力内容を確認してください。価格・人数・文字数が範囲内か確認してください。",
    );
  }
  return parsed.data;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: NO_STORE });
}
export function loginResponse(
  request: NextRequest,
  result: { code: string; token: string },
  session: RoomSession,
) {
  const response = json({ code: result.code });
  setSessionCookie(response, request, result.code, session, result.token);
  return response;
}

function setSessionCookie(
  response: NextResponse,
  request: NextRequest,
  code: string,
  session: RoomSession,
  token: string,
) {
  response.cookies.set(cookieName(code, session), token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: `/api/rooms/${code}`,
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function roomViewResponse(request: NextRequest, view: { code: string }) {
  const response = json(view);
  const session = sessionFor(request);
  const token = tokenFor(request, view.code);
  // An authenticated legacy session is promoted on its first scoped read.
  if (session && token && !request.cookies.has(cookieName(view.code, session)))
    setSessionCookie(response, request, view.code, session, token);
  return response;
}

export function failure(error: unknown) {
  if (error instanceof AuctionError)
    return json({ error: error.message, code: error.code }, error.status);
  // Do not log request bodies, credentials, or driver connection strings.
  console.error(
    "Auction request failed",
    error instanceof Error ? error.name : "UnknownError",
  );
  return json(
    {
      error:
        "サーバーに接続できませんでした。設定を確認するか、少し待って再試行してください。",
      code: "SERVER_UNAVAILABLE",
    },
    503,
  );
}

export const joinSchema = z
  .object({
    nickname: z.string().trim().min(1).max(MAX_NICKNAME_LENGTH),
    pin: z.string().regex(/^\d{4}$/),
  })
  .strict();
export const deleteRoomSchema = z
  .object({
    confirmed: z.literal(true),
    accessKey: z.string().max(256).default(""),
  })
  .strict();
