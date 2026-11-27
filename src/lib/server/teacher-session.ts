import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";
import { assertTeacherAccess, equal, newToken } from "./auth";
import { AuctionError } from "./errors";

export const TEACHER_SESSION_COOKIE = "lab_teacher_session";
export const TEACHER_SESSION_SECONDS = 8 * 60 * 60;

function signature(payload: string, key: string) {
  return createHmac("sha256", key)
    .update(`lab-teacher-session:${payload}`)
    .digest("hex");
}

export function createTeacherSession(accessKey: string, now = Date.now()) {
  assertTeacherAccess(accessKey);
  const key = process.env.TEACHER_ACCESS_KEY;
  if (!key) return ""; // Local development can run without a configured key.
  const payload = `v1.${now + TEACHER_SESSION_SECONDS * 1000}.${newToken()}`;
  return `${payload}.${signature(payload, key)}`;
}

export function validTeacherSession(
  token: string | undefined,
  now = Date.now(),
) {
  const key = process.env.TEACHER_ACCESS_KEY;
  if (!key) return !process.env.VERCEL;
  if (!token || !/^v1\.\d{13}\.\w{64}\.[a-f0-9]{64}$/.test(token)) return false;
  const [version, expiry, nonce, mac] = token.split(".");
  const expiresAt = Number(expiry);
  return (
    expiresAt > now &&
    equal(mac, signature(`${version}.${expiry}.${nonce}`, key))
  );
}

/** Keep the existing service-level key check; browser requests use a signed session. */
export function teacherAccessKey(request: NextRequest, fallback = "") {
  if (validTeacherSession(request.cookies.get(TEACHER_SESSION_COOKIE)?.value))
    return process.env.TEACHER_ACCESS_KEY ?? "";
  if (!fallback) {
    if (process.env.VERCEL && !process.env.TEACHER_ACCESS_KEY)
      assertTeacherAccess("");
    throw new AuctionError("教員用ページからログインしてください。", 401);
  }
  // Explicit keys remain supported for authenticated scripts and older clients.
  assertTeacherAccess(fallback);
  return fallback;
}

const demoPages = new Set([
  "/demo",
  "/demo/select",
  "/demo/preview",
  "/emh/demo",
  "/emh/demo/preview",
  "/judgment/demo",
  "/evolution/demo",
]);

export function teacherPageAvailable(path: string) {
  return (
    !demoPages.has(path.split("?")[0]!) ||
    Boolean(process.env.TEACHER_ACCESS_KEY)
  );
}

export function requireDemoTeacher(request: NextRequest, fallback?: string) {
  if (!process.env.TEACHER_ACCESS_KEY)
    throw new AuctionError("管理者による教員用キーの設定が必要です。", 503);
  teacherAccessKey(request, fallback);
}

export function teacherReturnPath(input?: string) {
  if (!input || input.length > 1024 || /[\\\r\n]/.test(input))
    return "/teacher";
  try {
    const url = new URL(input, "https://platform.invalid");
    if (url.origin !== "https://platform.invalid") return "/teacher";
    if (
      demoPages.has(url.pathname) ||
      url.pathname === "/teacher" ||
      (/^\/room\/[A-Z2-9]{6}$/.test(url.pathname) &&
        url.searchParams.get("entry") === "teacher")
    )
      return url.pathname + url.search;
  } catch {
    // Ignore malformed or external return destinations.
  }
  return "/teacher";
}
