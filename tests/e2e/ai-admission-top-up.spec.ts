import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { DEFAULT_SETTINGS } from "../../src/experiments/emh/settings";
import {
  defaults,
  memoDefaults,
} from "../../src/experiments/evolution/settings";
import type { AiRun } from "../../src/lib/ai-console";
import type { RoomSummary } from "../../src/lib/room-management";
import { signInTeacher } from "./helpers/teacher-login";

test.skip(
  process.env.AI_EXPERIMENTS_ENABLED !== "1",
  "Requires the local AI console",
);

const consolePath = "/api/teacher/ai";
const model = "admission-test-model";
const password = "Local-admission-test";

async function enroll(request: APIRequestContext, code: string, count: number) {
  const response = await request.post(consolePath, {
    data: {
      action: "start",
      code,
      count,
      model,
      provider: "local",
      parallel: 2,
      interval: 10,
      timeout: 60,
      maxOutputTokens: 2048,
    },
  });
  await expect(response).toBeOK();
  const { selected } = await response.json();
  return selected as string;
}

function topUp(request: APIRequestContext, id: string, count: number) {
  return request.post(consolePath, { data: { action: "top-up", id, count } });
}

async function ready(request: APIRequestContext, id: string, count: number) {
  await expect
    .poll(async () => {
      const response = await request.get(`${consolePath}?status=${id}`);
      const run: AiRun = await response.json();
      return [run.phase, run.joined, run.count];
    })
    .toEqual(["ready", count, count]);
}

async function roomSummary(request: APIRequestContext, code: string) {
  const response = await request.post("/api/rooms/manage", { data: {} });
  await expect(response).toBeOK();
  const { rooms }: { rooms: RoomSummary[] } = await response.json();
  return rooms.find((room) => room.code === code);
}

async function openConsole(page: Page, code: string) {
  await page.goto("/teacher/ai");
  const rooms = page.getByLabel("ルーム", { exact: true });
  await expect(rooms.locator(`option[value="${code}"]`)).toHaveCount(1);
  await rooms.selectOption(code);
  await expect(
    page.getByRole("spinbutton", { name: "AI の目標人数" }),
  ).toBeVisible();
}

test("AI-only SEG tops up 10 to exactly 50 seats with only a teacher signed in", async ({
  page,
}) => {
  await signInTeacher(page.request);
  const created = await page.request.post("/api/evolution/rooms", {
    data: {
      title: "SEG AI admission review",
      password,
      settings: defaults("coordination"),
    },
  });
  await expect(created).toBeOK();
  const { code } = await created.json();
  let id: string | undefined;
  try {
    const path = `/api/rooms/${code}`;
    id = await enroll(page.request, code, 10);
    await ready(page.request, id, 10);
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: 10,
    });
    await openConsole(page, code);

    const target = page.getByRole("spinbutton", { name: "AI の目標人数" });
    const submit = page.getByRole("button", { name: "AI を補充" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(submit).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await submit.evaluate(
          (button) => button.scrollWidth <= button.clientWidth + 1,
        ),
      ).toBe(true);
    }
    await target.fill("50");
    await submit.click();
    await expect(page.getByText("50 / 50 人", { exact: true })).toBeVisible();
    await expect(page.getByLabel("実行履歴")).toHaveValue(id);
    expect(await roomSummary(page.request, code)).toMatchObject({
      code,
      participantCount: 50,
    });
    expect(
      (await page.context().cookies()).some(
        ({ name }) => name === `auction_${code}_student`,
      ),
    ).toBe(false);

    await expect(await topUp(page.request, id, 50)).toBeOK();
    expect((await topUp(page.request, id, 49)).status()).toBe(409);
    const closed = await page.request.post(
      `${path}/evolution?session=teacher`,
      { data: { kind: "close" } },
    );
    await expect(closed).toBeOK();
    expect(await closed.json()).toMatchObject({ role: "teacher", count: 50 });
    const tooLate = await topUp(page.request, id, 51);
    expect(tooLate.status()).toBe(409);
    expect(await tooLate.json()).toMatchObject({ code: "AI_ADMISSION_CLOSED" });
    expect(await roomSummary(page.request, code)).toMatchObject({
      code,
      participantCount: 50,
    });
    await page.reload();
    await expect(page.locator(`#ai-room option[value="${code}"]`)).toHaveCount(
      0,
    );
  } finally {
    if (id)
      await page.request.post(consolePath, { data: { action: "stop", id } });
  }
});

test("Stag Hunt v3 counts human students toward its 150-seat capacity", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInTeacher(page.request);
  const created = await page.request.post("/api/evolution/rooms", {
    data: { title: "Stag Hunt capacity", password, settings: memoDefaults() },
  });
  await expect(created).toBeOK();
  const { code } = await created.json();
  const student = await browser.newContext({ baseURL });
  let id: string | undefined;
  try {
    await expect(
      await student.request.post(`/api/rooms/${code}/join`, {
        data: { nickname: "Human", pin: "5819" },
      }),
    ).toBeOK();
    id = await enroll(page.request, code, 1);
    await ready(page.request, id, 1);
    const overCapacity = await topUp(page.request, id, 150);
    expect(overCapacity.status()).toBe(409);
    expect(await overCapacity.json()).toMatchObject({
      code: "AI_ADMISSION_CAPACITY",
    });
    expect(await roomSummary(page.request, code)).toMatchObject({
      capacity: 150,
      participantCount: 2,
      admissionRemaining: 148,
    });
    await ready(page.request, id, 1);
    const retries = await Promise.all([
      topUp(page.request, id, 4),
      topUp(page.request, id, 4),
    ]);
    expect(retries.some((response) => response.ok())).toBe(true);
    expect(
      retries.every((response) => [200, 409].includes(response.status())),
    ).toBe(true);
    await ready(page.request, id, 4);
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: 5,
    });
  } finally {
    if (id)
      await page.request.post(consolePath, { data: { action: "stop", id } });
    await student.close();
  }
});

test("closing mid-top-up preserves admitted AI and reopening retries only the remainder", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInTeacher(page.request);
  const created = await page.request.post("/api/evolution/rooms", {
    data: {
      title: "Interrupted AI admission",
      password,
      settings: defaults("coordination"),
    },
  });
  await expect(created).toBeOK();
  const { code } = await created.json();
  const path = `/api/rooms/${code}`;
  const student = await browser.newContext({ baseURL });
  let id: string | undefined;
  async function status(): Promise<AiRun> {
    return (await page.request.get(`${consolePath}?status=${id}`)).json();
  }
  try {
    await expect(
      await student.request.post(`${path}/join`, {
        data: { nickname: "Human", pin: "9280" },
      }),
    ).toBeOK();
    const initial = await student.cookies();
    id = await enroll(page.request, code, 1);
    await ready(page.request, id, 1);
    await expect(await topUp(page.request, id, 100)).toBeOK();
    await expect.poll(async () => (await status()).joined).toBeGreaterThan(1);
    const closed = await page.request.post(
      `${path}/evolution?session=teacher`,
      {
        data: { kind: "close" },
      },
    );
    await expect(closed).toBeOK();
    const { revision } = await closed.json();
    await expect.poll(async () => Boolean((await status()).error)).toBe(true);
    const partial = await status();
    expect(partial.joined).toBeLessThan(100);
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: partial.joined + 1,
    });
    await expect(
      await page.request.post(`${path}/evolution?session=teacher`, {
        data: { kind: "reopen", revision },
      }),
    ).toBeOK();
    await expect(await topUp(page.request, id, 100)).toBeOK();
    await ready(page.request, id, 100);
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: 101,
    });
    const preserved = await student.request.get(
      `${path}/evolution?session=student`,
    );
    await expect(preserved).toBeOK();
    expect(await preserved.json()).toMatchObject({ role: "student" });
    expect(await student.cookies()).toEqual(initial);
  } finally {
    if (id)
      await page.request.post(consolePath, { data: { action: "stop", id } });
    await student.close();
  }
});

test("EMH exposes the same teacher-console top-up", async ({ page }) => {
  await signInTeacher(page.request);
  const created = await page.request.post("/api/emh/rooms", {
    data: {
      title: "EMH AI admission review",
      password,
      experiment: "exp1",
      settings: DEFAULT_SETTINGS,
    },
  });
  await expect(created).toBeOK();
  const { code } = await created.json();
  const id = await enroll(page.request, code, 1);
  try {
    await ready(page.request, id, 1);
    await openConsole(page, code);
    await page.getByRole("spinbutton", { name: "AI の目標人数" }).fill("3");
    await page.getByRole("button", { name: "AI を補充" }).click();
    await expect(page.getByText("3 / 3 人", { exact: true })).toBeVisible();
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: 3,
    });
  } finally {
    await page.request.post(consolePath, { data: { action: "stop", id } });
  }
});

test("Double Auction also tops up from the room's admission panel", async ({
  page,
}) => {
  await signInTeacher(page.request);
  await page.goto("/teacher?experiment=institutions");
  await page.getByLabel("教員パスワード", { exact: false }).fill(password);
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  const id = await enroll(page.request, code, 1);
  try {
    await ready(page.request, id, 1);
    await page.reload();
    const next = page.getByRole("button", {
      name: "確定して次へ",
      exact: true,
    });
    await next.click();
    await next.click();
    const target = page.getByRole("spinbutton", { name: "AI の目標人数" });
    await target.fill("3");
    await page.getByRole("button", { name: "AI を補充" }).click();
    await expect(
      page.getByText("AI 入室 3 / 3", { exact: true }),
    ).toBeVisible();
    expect(await roomSummary(page.request, code)).toMatchObject({
      participantCount: 3,
    });
  } finally {
    await page.request.post(consolePath, { data: { action: "stop", id } });
  }
});
