import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { POST, DELETE } from "../src/app/api/teacher/session/route";
import { studies } from "../src/experiments/judgment/server/core";
import { POST as preview } from "../src/app/api/judgment/preview/route";
import {
  createTeacherSession,
  validTeacherSession,
  teacherAccessKey,
  teacherReturnPath,
  TEACHER_SESSION_COOKIE,
  TEACHER_SESSION_SECONDS,
} from "../src/lib/server/teacher-session";

const key = "unit-test-teacher-access-key";
const oldKey = process.env.TEACHER_ACCESS_KEY;
const oldVercel = process.env.VERCEL;
before(() => {
  process.env.TEACHER_ACCESS_KEY = key;
  delete process.env.VERCEL;
});
after(() => {
  if (oldKey === undefined) delete process.env.TEACHER_ACCESS_KEY;
  else process.env.TEACHER_ACCESS_KEY = oldKey;
  if (oldVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = oldVercel;
});
function request(
  payload: unknown,
  token?: string,
  method = "POST",
  origin = "https://platform.test",
) {
  return new NextRequest("https://platform.test/api/teacher/session", {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(token ? { Cookie: `${TEACHER_SESSION_COOKIE}=${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

test("teacher session is signed, expires, rejects tampering and rotates with the key", () => {
  const now = 1793580000000;
  const token = createTeacherSession(key, now);
  assert.equal(validTeacherSession(token, now), true);
  assert.equal(
    validTeacherSession(token, now + TEACHER_SESSION_SECONDS * 1000 - 1),
    true,
  );
  assert.equal(
    validTeacherSession(token, now + TEACHER_SESSION_SECONDS * 1000),
    false,
  );
  assert.equal(validTeacherSession(undefined, now), false);
  assert.equal(validTeacherSession(token.replace("v1.", "v2."), now), false);
  assert.equal(
    validTeacherSession(
      token.replace(/.$/, token.endsWith("a") ? "b" : "a"),
      now,
    ),
    false,
  );
  const segments = token.split(".");
  segments[1] = String(now + 999999999);
  assert.equal(validTeacherSession(segments.join("."), now), false);
  assert.ok(!token.includes(key));
  process.env.TEACHER_ACCESS_KEY = "rotated-key";
  try {
    assert.equal(validTeacherSession(token, now), false);
  } finally {
    process.env.TEACHER_ACCESS_KEY = key;
  }
});

test("login validates key and same-origin JSON, sends only a protected cookie; logout clears it", async () => {
  assert.equal((await POST(request({ accessKey: "incorrect" }))).status, 403);
  assert.equal(
    (
      await POST(
        request({ accessKey: key }, undefined, "POST", "https://foreign.test"),
      )
    ).status,
    403,
  );
  assert.equal(
    (await POST(request({ accessKey: key, admin: true }))).status,
    400,
  );
  const response = await POST(request({ accessKey: key }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { authenticated: true });
  const cookie = response.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=lax/i);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=28800/);
  assert.ok(!cookie.includes(key));
  assert.match(response.headers.get("cache-control")!, /no-store/);
  const loggedOut = await DELETE(request({}, undefined, "DELETE"));
  assert.match(loggedOut.headers.get("set-cookie")!, /Max-Age=0/);
  assert.equal(
    (await DELETE(request({}, undefined, "DELETE", "https://foreign.test")))
      .status,
    403,
  );
});

test("native teacher login posts the key, checks origin, and redirects without credentials", async () => {
  const origin = "http://192.0.2.1:3001";
  const next = "/evolution/demo";
  function submit(accessKey: string, source: string) {
    return POST(
      new NextRequest(`${origin}/api/teacher/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(source ? { Origin: source } : {}),
        },
        body: new URLSearchParams({ accessKey, next }),
      }),
    );
  }
  const response = await submit(key, origin);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), next);
  const session = response.cookies.get(TEACHER_SESSION_COOKIE);
  assert.equal(validTeacherSession(session?.value), true);
  assert.equal(session?.httpOnly, true);
  assert.equal(session?.secure, false);
  for (const [value, source] of [
    ["synthetic-invalid-key", origin],
    [key, "https://foreign.test"],
    [key, ""],
  ]) {
    const rejected = await submit(value, source);
    assert.equal(rejected.status, 303);
    const target = new URL(rejected.headers.get("location")!, origin);
    assert.equal(target.pathname, "/teacher/login");
    assert.equal(target.searchParams.get("failed"), "1");
    assert.ok(!target.href.includes(value));
    assert.equal(rejected.cookies.has(TEACHER_SESSION_COOKIE), false);
  }
});

test("protected API access accepts the session without resending a key and rejects anonymous requests", async () => {
  const token = createTeacherSession(key);
  assert.equal(teacherAccessKey(request({}, token)), key);
  assert.equal(teacherAccessKey(request({}), key), key);
  assert.throws(() => teacherAccessKey(request({})), /ログイン/);
  assert.throws(() => teacherAccessKey(request({}, "forged")), /ログイン/);
  const settings = {
    studyIds: [studies[0].id],
    randomizeExperiments: false,
    randomizeChoices: false,
  };
  assert.equal((await preview(request({ settings }))).status, 401);
  assert.equal((await preview(request({ settings }, token))).status, 200);
});

test("production fails closed without a configured key; keyless local development stays usable", () => {
  delete process.env.TEACHER_ACCESS_KEY;
  try {
    assert.equal(validTeacherSession(undefined), true);
    process.env.VERCEL = "1";
    assert.equal(validTeacherSession(undefined), false);
    assert.throws(() => createTeacherSession(""), /設定が必要/);
    assert.throws(() => teacherAccessKey(request({})), /設定が必要/);
  } finally {
    process.env.TEACHER_ACCESS_KEY = key;
    delete process.env.VERCEL;
  }
});

test("login only returns to local teacher pages", () => {
  assert.equal(
    teacherReturnPath("/teacher?experiment=emh"),
    "/teacher?experiment=emh",
  );
  assert.equal(
    teacherReturnPath("/room/ABC234?entry=teacher"),
    "/room/ABC234?entry=teacher",
  );
  for (const path of [
    "/demo",
    "/demo/select",
    "/demo/preview",
    "/emh/demo",
    "/emh/demo/preview",
    "/judgment/demo",
  ])
    assert.equal(teacherReturnPath(path), path);
  for (const path of [
    "//evil.test/demo",
    "/demo/fake",
    "/api/judgment/demo",
    "https://evil.test/teacher",
    "//evil.test/teacher",
    "/\\evil.test/teacher",
    "javascript:alert(1)",
    "/teacher/login",
    "/room/ABC234",
    "/api/rooms/manage",
  ])
    assert.equal(teacherReturnPath(path), "/teacher");
});
