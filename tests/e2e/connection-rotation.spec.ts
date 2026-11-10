import { signInTeacher } from "./helpers/teacher-login";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import type {
  Command,
  RoomView,
} from "../../src/experiments/double-auction/lib/types";

test.describe.configure({ mode: "parallel" });

async function classroom(
  teacher: Page,
  browser: Browser,
  baseURL: string,
  seconds: number,
) {
  expect(["127.0.0.1", "localhost"]).toContain(new URL(baseURL).hostname);
  await signInTeacher(teacher.request);
  const created = await teacher.request.post("/api/rooms", {
    data: {
      config: {
        title: "接続切替テスト",
        protocol: "institutions-v1",
        markets: 1,
        marketSize: 2,
        capacity: 2,
        rounds: 2,
        duration: seconds,
        studyInstitutions: ["cda"],
        studyPeriods: { cda: 2 },
        studyTiming: {
          cdaSeconds: seconds,
          callSeconds: 30,
          offerSeconds: 60,
          buyerSeconds: 10,
        },
      },
      password: "Local-rotation-test-only",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { code } = await created.json();
  const path = `/api/rooms/${code}`;
  const contexts: BrowserContext[] = [];
  const snapshot = async (context: BrowserContext) => {
    const response = await context.request.get(path);
    expect(response.ok()).toBe(true);
    const view = (await response.json()) as RoomView;
    expect(view.mode).toBe("local");
    return view;
  };
  const send = async (context: BrowserContext, command: Command) => {
    const view = await snapshot(context);
    return context.request.post(`${path}/commands`, {
      data: {
        requestId: randomUUID(),
        expectedRound: view.round,
        expectedStage: view.study!.market.stageKey,
        command,
      },
    });
  };
  const cleanup = async () => {
    for (const context of contexts) await context.close();
    expect(
      (await teacher.request.delete(path, { data: { confirmed: true } })).ok(),
    ).toBe(true);
  };
  try {
    for (const nickname of ["接続確認A", "接続確認B"]) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: 1366, height: 900 },
      });
      contexts.push(context);
      expect(
        (
          await context.request.post(`${path}/join`, {
            data: { nickname, pin: "1234" },
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await send(teacher.context(), {
          type: "study-randomize",
          expectedRevision: 0,
        })
      ).ok(),
    ).toBe(true);
    const people = await Promise.all(
      contexts.map(async (context) => ({
        context,
        view: await snapshot(context),
        page: await context.newPage(),
      })),
    );
    const buyer = people.find((person) => person.view.me.role === "buyer")!;
    const seller = people.find((person) => person.view.me.role === "seller")!;
    await Promise.all([
      teacher.goto(`/room/${code}?entry=teacher`),
      ...people.map((person) => person.page.goto(`/room/${code}`)),
    ]);
    return { code, path, buyer, seller, snapshot, send, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function monitor(page: Page) {
  await expect(
    page.getByText("再接続しています。取引操作は一時的に停止中です。", {
      exact: false,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    document.body.dataset.sawReconnect = "false";
    new MutationObserver(() => {
      if (
        document
          .querySelector(".error-message")
          ?.textContent?.includes("再接続")
      )
        document.body.dataset.sawReconnect = "true";
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

test("short CDA rotates during End/Start, preserves fills, pauses the overlay and shows real offline errors", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const f = await classroom(page, browser, baseURL!, 15);
  try {
    const errors: string[] = [];
    const streams: number[] = [];
    for (const target of [page, f.buyer.page, f.seller.page])
      target.on("pageerror", (error) => errors.push(error.message));
    f.buyer.page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/events"))
        streams.push(Date.now());
    });
    await page
      .getByRole("button", { name: "実験設定を変更", exact: true })
      .click();
    const settings = page.getByRole("dialog", {
      name: "実験設定",
      exact: true,
    });
    await expect(settings.getByText(/1期240秒（4分）以内を推奨/)).toBeVisible();
    for (const seconds of [241, 15]) {
      await settings
        .getByRole("button", { name: "時間を変更", exact: true })
        .click();
      const input = settings.getByRole("spinbutton", {
        name: "CDA：1期の取引時間（秒）",
        exact: true,
      });
      await expect(input).toHaveAttribute("max", "3600");
      await input.fill(String(seconds));
      await settings
        .getByRole("button", { name: "時間設定を保存", exact: true })
        .click();
      await expect(
        settings.getByText("時間設定を保存しました。", { exact: true }),
      ).toBeVisible();
      expect(
        (await f.snapshot(page.context())).config.studyTiming!.cdaSeconds,
      ).toBe(seconds);
    }
    await settings.getByRole("button", { name: "閉じる", exact: true }).click();
    await monitor(f.buyer.page);
    await page.getByRole("button", { name: "実験を開始", exact: true }).click();
    const roster = page.getByRole("region", { name: /^学生の割り当て/ });
    await expect(roster.locator(".study-roster-content")).toBeHidden();
    await roster.getByRole("button", { name: "割り当てを表示" }).click();
    await expect(roster.locator(".study-roster-content")).toBeVisible();
    await roster.getByRole("button", { name: "割り当てを折りたたむ" }).click();
    await expect(roster.locator(".study-roster-content")).toBeHidden();
    await expect(
      f.buyer.page.getByRole("heading", { name: "第1期 Start", exact: true }),
    ).toBeVisible();
    const quote = f.buyer.page.getByRole("button", {
      name: "指値注文",
      exact: true,
    });
    await expect(quote).toBeDisabled();
    await expect(quote).toBeEnabled({ timeout: 10000 });
    const initialConnections = streams.length;
    expect(
      (
        await f.send(f.seller.context, { type: "study-quote", price: 100 })
      ).ok(),
    ).toBe(true);
    expect(
      (await f.send(f.buyer.context, { type: "study-quote", price: 100 })).ok(),
    ).toBe(true);
    const trade = (await f.snapshot(f.buyer.context)).study!.myTrades[0];
    await expect(
      f.buyer.page.getByRole("heading", { name: "第1期 End", exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(quote).toBeDisabled();
    await f.buyer.page.screenshot({
      path: info.outputPath("cda-period-end.png"),
    });
    await expect.poll(() => streams.length).toBe(initialConnections + 1);
    await expect(f.buyer.page.locator("body")).toHaveAttribute(
      "data-saw-reconnect",
      "false",
    );
    await expect(
      f.buyer.page.getByRole("heading", { name: "第2期 Start", exact: true }),
    ).toBeVisible();
    expect((await f.send(page.context(), { type: "pause" })).ok()).toBe(true);
    const paused = await f.snapshot(f.buyer.context);
    expect(paused.study!.market.stage).toBe("feedback");
    await f.buyer.page.reload();
    await expect(
      f.buyer.page.getByRole("heading", { name: "第2期 Start", exact: true }),
    ).toBeVisible();
    await expect(quote).toBeDisabled();
    await expect(f.buyer.page.locator(".study-countdown-card")).toContainText(
      "教員が再開するまで",
    );
    expect((await f.snapshot(f.buyer.context)).study!.market.remainingMs).toBe(
      paused.study!.market.remainingMs,
    );
    await f.buyer.page.screenshot({
      path: info.outputPath("cda-period-start-paused.png"),
    });
    await monitor(f.buyer.page);
    expect((await f.send(page.context(), { type: "resume" })).ok()).toBe(true);
    await expect(quote).toBeEnabled({ timeout: 10000 });
    const next = await f.snapshot(f.buyer.context);
    expect(next.round).toBe(2);
    expect(next.study!.myTrades.find((fill) => fill.id === trade.id)).toEqual(
      trade,
    );
    expect(next.study!.unitsUsed).toBe(0);
    await expect(f.buyer.page.locator("body")).toHaveAttribute(
      "data-saw-reconnect",
      "false",
    );
    await f.buyer.context.setOffline(true);
    await expect(
      f.buyer.page.getByText(
        "再接続しています。取引操作は一時的に停止中です。",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(quote).toBeDisabled();
    await f.buyer.context.setOffline(false);
    await expect(quote).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    await f.cleanup();
  }
});

test("long CDA rotates after four real minutes without losing a standing order or showing reconnection", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.ROTATION_LONG_E2E !== "1",
    "Opt-in real four-minute connection test",
  );
  test.setTimeout(330000);
  const f = await classroom(page, browser, baseURL!, 300);
  try {
    expect((await f.send(page.context(), { type: "start" })).ok()).toBe(true);
    const quote = f.buyer.page.getByRole("button", {
      name: "指値注文",
      exact: true,
    });
    await expect(quote).toBeEnabled({ timeout: 15000 });
    expect(
      (await f.send(f.buyer.context, { type: "study-quote", price: 1 })).ok(),
    ).toBe(true);
    const before = await f.snapshot(f.buyer.context);
    const streams: number[] = [];
    f.buyer.page.on("request", (request) => {
      if (new URL(request.url()).pathname.endsWith("/events"))
        streams.push(Date.now());
    });
    await f.buyer.page.reload();
    await expect(quote).toBeEnabled();
    await monitor(f.buyer.page);
    await expect
      .poll(() => streams.length, { timeout: 260000, intervals: [1000] })
      .toBe(2);
    expect(streams[1] - streams[0]).toBeGreaterThanOrEqual(239000);
    expect(streams[1] - streams[0]).toBeLessThan(250000);
    const after = await f.snapshot(f.buyer.context);
    expect(after.study!.market.stage).toBe("cda");
    expect(after.study!.market.myOrders).toEqual(before.study!.market.myOrders);
    await expect(quote).toBeEnabled();
    await expect(f.buyer.page.locator("body")).toHaveAttribute(
      "data-saw-reconnect",
      "false",
    );
    // An order command still works immediately after the handoff.
    expect(
      (await f.send(f.buyer.context, { type: "study-quote", price: 2 })).ok(),
    ).toBe(true);
  } finally {
    await f.cleanup();
  }
});
