import { expect, test } from "@playwright/test";
import { verificationTarget } from "../../scripts/verification-target";
import type { RoomSummary } from "../../src/lib/room-management";
import { enterTeacherPage } from "./helpers/teacher-login";

test("room management labels all experiments and combines its filters in Japan time", async ({
  page,
}) => {
  const samples = [
    [
      "evolution",
      "EVOL23",
      "2026-12-01T00:00:00+09:00",
      "waiting",
      "Stochastic Evolutionary Games",
    ],
    [
      "judgment",
      "JUDG23",
      "2026-11-30T23:59:59+09:00",
      "waiting",
      "Judgement under Uncertainty",
    ],
    [
      "emh",
      "EMHS23",
      "2026-11-15T00:00:00+09:00",
      "waiting",
      "Efficient Market Hypothesis",
    ],
    [
      "institutions",
      "AUCD23",
      "2026-11-01T00:00:00+09:00",
      "finished",
      "Double Auction",
    ],
    [
      "institutions",
      "AUCO23",
      "2026-10-31T23:59:59+09:00",
      "waiting",
      "Double Auction",
    ],
  ] as const;
  const rooms: RoomSummary[] = samples.map(
    ([experiment, code, createdAt, phase]) => ({
      experiment,
      code,
      createdAt: Date.parse(createdAt),
      phase,
      title: `授業用ルーム ${code}`,
      round: 1,
      totalRounds: 5,
      participantCount: 0,
      capacity: 16,
      marketCount: 1,
      institutions: [],
    }),
  );
  await page.route("**/api/rooms/manage", (route) =>
    route.fulfill({ json: { rooms } }),
  );
  await page.goto("/teacher");
  await enterTeacherPage(page);
  const management = page.getByRole("region", { name: "ルーム管理" });
  const cards = management.getByRole("listitem");
  const experiment = management.getByRole("combobox", {
    name: "実験",
    exact: true,
  });
  const month = management.getByRole("combobox", { name: "作成月" });
  const phase = management.getByRole("combobox", { name: "状態" });
  const query = management.getByRole("searchbox");
  for (const [, code, , , label] of samples) {
    const room = cards.filter({
      has: page.getByRole("heading", { name: `授業用ルーム ${code}` }),
    });
    await expect(room.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(month.getByRole("option")).toHaveText([
    "すべての月",
    "2026年12月",
    "2026年11月",
    "2026年10月",
  ]);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await experiment.selectOption("evolution");
    await expect(cards).toHaveCount(1);
    expect(
      await experiment.evaluate((select: HTMLSelectElement) => {
        const style = getComputedStyle(select);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        const label = select.selectedOptions[0].text;
        const inset = parseFloat(style.paddingInlineStart);
        const dropdownArrowSpace = 24;
        return (
          context.measureText(label).width + inset + dropdownArrowSpace <=
          select.clientWidth
        );
      }),
      `Experiment option fits at ${width}px`,
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await management
        .locator(
          ".teacher-room-card h3, .teacher-room-experiment, .teacher-room-actions > *",
        )
        .evaluateAll((elements) =>
          elements.every((el) => el.scrollWidth <= el.clientWidth + 1),
        ),
    ).toBe(true);
  }
  await experiment.selectOption("institutions");
  await expect(cards).toHaveCount(2);
  await month.selectOption("2026年11月");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("AUCD23");
  await phase.selectOption("waiting");
  await expect(cards).toHaveCount(0);
  await expect(
    management.getByText("条件に一致するルームはありません。"),
  ).toBeVisible();
  await phase.selectOption("finished");
  await query.fill("auco23");
  await expect(cards).toHaveCount(0);
  await query.fill("double auction");
  await expect(cards).toHaveCount(1);
  await expect(
    cards.getByRole("link", { name: /結果・ダウンロード/ }),
  ).toHaveAttribute("href", "/teacher?code=AUCD23");
});

test("one teacher login protects entry and authorizes all experiments and management without another key", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  test.skip(!accessKey, "Requires a key-enabled verification server");
  const codes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const outsider = await browser.newContext({ baseURL });
  try {
    await page.goto("/teacher?experiment=emh");
    await expect(page).toHaveURL(/\/teacher\/login\?next=/);
    await expect(
      page.getByRole("heading", { name: "教員ログイン", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
    expect(
      (await page.request.post("/api/rooms/manage", { data: {} })).status(),
    ).toBe(401);
    for (const [endpoint, payload] of [
      ["/api/emh/rooms", { title: "Denied", password: "12345678" }],
      [
        "/api/rooms",
        {
          password: "12345678",
          config: { title: "Denied", capacity: 12, rounds: 1, duration: 180 },
        },
      ],
      [
        "/api/judgment/rooms",
        {
          title: "Denied",
          password: "12345678",
          settings: {
            studyIds: ["01-02"],
            randomizeExperiments: false,
            randomizeChoices: false,
          },
        },
      ],
    ] as const)
      expect(
        (await page.request.post(endpoint, { data: payload })).status(),
      ).toBe(401);
    await page
      .getByLabel("教員用キー", { exact: false })
      .fill("invalid-test-key");
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    await expect(
      page.locator(".teacher-login").getByRole("alert"),
    ).toContainText("正しくありません");
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel("教員用キー", { exact: false }).fill(accessKey);
    const loginResponse = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/teacher/session") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "ログイン", exact: true }).click();
    expect((await loginResponse).ok()).toBe(true);
    await expect(page).toHaveURL(/\/teacher\?experiment=emh$/);
    const cookies = await page.context().cookies();
    const session = cookies.find(
      (cookie) => cookie.name === "lab_teacher_session",
    )!;
    expect(session.httpOnly).toBe(true);
    expect(session.sameSite).toBe("Lax");
    expect(session.secure).toBe(new URL(baseURL!).protocol === "https:");
    expect(session.value).not.toContain(accessKey);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "lab_teacher_session",
    );
    expect(
      await page.evaluate(() => ({
        local: localStorage.getItem("accessKey"),
        session: sessionStorage.getItem("accessKey"),
      })),
    ).toEqual({ local: null, session: null });
    await page.reload();
    await expect(page).toHaveURL(/\/teacher\?experiment=emh$/);
    await page
      .locator(".emh-create")
      .screenshot({ path: info.outputPath("emh-create-after-login.png") });

    for (const experiment of ["emh", "institutions", "judgment"]) {
      await page.goto(`/teacher?experiment=${experiment}`);
      await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
        0,
      );
      await page
        .getByLabel("実験名", { exact: true })
        .fill(`入口検証 ${experiment}`);
      await page
        .getByLabel("教員パスワード", { exact: false })
        .fill("Teacher-Entry-Verification");
      if (experiment === "judgment")
        await page
          .locator('.judgment-study-option input[type="checkbox"]')
          .first()
          .check();
      const responsePromise = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/(?:emh\/|judgment\/)?rooms$/.test(new URL(r.url()).pathname),
      );
      await page
        .getByRole("button", {
          name: experiment === "institutions" ? "ルーム作成" : "ルームを作成",
          exact: true,
        })
        .click();
      const response = await responsePromise;
      expect(response.ok()).toBe(true);
      expect(response.request().postDataJSON()).not.toHaveProperty("accessKey");
      await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher$/);
      const code = new URL(page.url()).pathname.split("/")[2];
      codes.push(code);
      if (experiment === "emh") {
        await expect(
          await outsider.request.post(`/api/rooms/${code}/join`, {
            data: { nickname: "学生A", pin: "2468" },
          }),
        ).toBeOK();
        const student = await outsider.newPage();
        await student.goto(`/room/${code}`);
        await expect(student).toHaveURL(`/room/${code}`);
        await student.goto("/emh/demo");
        await expect(
          student.getByRole("heading", { name: "教員ログイン" }),
        ).toBeVisible();
        await student.close();
      }
      await expect(page).toHaveURL(`/room/${code}?entry=teacher`);
      const unauthorized = await outsider.newPage();
      await unauthorized.goto(`/room/${code}?entry=teacher`);
      await expect(unauthorized).toHaveURL(/\/teacher\/login/);
      await unauthorized.close();
    }
    await page.goto("/teacher");
    await expect(page.locator(".teacher-room-list")).toBeVisible();
    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "更新", exact: true }).click();
    const rooms = await (
      await page.request.post("/api/rooms/manage", { data: {} })
    ).json();
    for (const code of codes)
      expect(
        rooms.rooms.some((room: { code: string }) => room.code === code),
      ).toBe(true);
    const original = codes[0];
    await page.goto(`/teacher?code=${original}`);
    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
    await page
      .getByLabel("教員パスワード", { exact: false })
      .fill("Teacher-Entry-Verification");
    await page
      .getByRole("button", { name: "管理画面に入る", exact: true })
      .click();
    await expect(page).toHaveURL(`/room/${original}?entry=teacher`);
    for (const code of codes)
      expect(
        (
          await page.request.delete(`/api/rooms/${code}`, {
            data: { confirmed: true },
          })
        ).ok(),
      ).toBe(true);
    codes.length = 0;
    await page.goto("/teacher");
    await page.getByRole("button", { name: "ログアウト", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher\/login/);
    expect(
      (await page.request.post("/api/rooms/manage", { data: {} })).status(),
    ).toBe(401);
    await page.goto("/teacher?experiment=judgment");
    await expect(page).toHaveURL(/\/teacher\/login/);
    expect(errors).toEqual([]);
  } finally {
    // Clean up only this test's rooms, even if the UI check failed or logged out.
    for (const code of codes)
      expect
        .soft(
          (
            await page.request.delete(`/api/rooms/${code}`, {
              data: { confirmed: true, accessKey },
            })
          ).ok(),
        )
        .toBe(true);
    await outsider.close();
  }
});

test("direct demo links, embedded previews and question requests require a teacher session", async ({
  page,
  baseURL,
}) => {
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  test.skip(!accessKey, "Requires a key-enabled verification server");
  const paths = [
    "/demo",
    "/demo/select",
    "/demo/preview",
    "/emh/demo",
    "/emh/demo/preview",
    "/judgment/demo",
  ];
  const settings = {
    studyIds: ["01-02"],
    randomizeExperiments: false,
    randomizeChoices: false,
  };
  const denied = async (path: string, headers?: Record<string, string>) => {
    const response = await page.request.get(path, { maxRedirects: 0, headers });
    expect(response.status()).toBe(307);
    const location = new URL(response.headers().location!, baseURL);
    expect(location.pathname).toBe("/teacher/login");
    expect(location.searchParams.get("next")).toBe(path);
    expect(response.headers()["cache-control"]).toMatch(/no-store|no-cache/);
    expect(response.headers()["cache-control"]).not.toMatch(/public|s-maxage/);
  };
  for (const path of paths) await denied(path);
  const flight = await page.request.get("/emh/demo", { headers: { RSC: "1" } });
  expect(flight.headers()["content-type"]).toContain("text/x-component");
  expect(await flight.text()).toContain("/teacher/login?next=%2Femh%2Fdemo");
  await denied("/demo", { Cookie: "lab_teacher_session=forged" });
  expect(
    (
      await page.request.post("/api/judgment/demo", { data: settings })
    ).status(),
  ).toBe(401);
  await page.goto("/demo/preview");
  await expect(
    page.getByRole("heading", { name: "教員ログイン" }),
  ).toBeVisible();
  await page.getByLabel("教員用キー").fill(accessKey);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL("/demo/preview");
  await expect(
    page
      .frameLocator("iframe")
      .getByRole("button", { name: "ルーム作成", exact: true }),
  ).toBeVisible();
  for (const path of paths) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/no-store|no-cache/);
    expect(response.headers()["cache-control"]).not.toMatch(/public|s-maxage/);
  }
  await expect(
    await page.request.post("/api/judgment/demo", { data: settings }),
  ).toBeOK();
  await page.goto("/teacher");
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page).toHaveURL(/\/teacher\/login/);
  for (const path of paths) await denied(path);
  expect(
    (
      await page.request.post("/api/judgment/demo", { data: settings })
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await expect(
    page.getByRole("form", { name: "実験に参加する" }),
  ).toBeVisible();
});
