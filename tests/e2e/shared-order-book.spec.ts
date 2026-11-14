import { test, expect, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verificationTarget } from "../../scripts/verification-target";
import type {
  Command,
  RoomView,
} from "../../src/experiments/double-auction/lib/types";

test("CDA shared book retains anonymous prices, own markers and immediate execution", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  const contexts: BrowserContext[] = [];
  let code: string | undefined;
  try {
    expect(
      (
        await page.request.post("/api/teacher/session", { data: { accessKey } })
      ).ok(),
    ).toBe(true);
    const created = await page.request.post("/api/rooms", {
      data: {
        config: {
          title: "Shared book verification",
          protocol: "institutions-v1",
          markets: 1,
          marketSize: 2,
          capacity: 2,
          rounds: 1,
          duration: 240,
          studyInstitutions: ["cda"],
          studyPeriods: { cda: 1 },
          studyTiming: {
            cdaSeconds: 240,
            callSeconds: 30,
            offerSeconds: 60,
            buyerSeconds: 10,
          },
        },
        password: "Shared-book-check-only",
      },
    });
    expect(created.ok(), await created.text()).toBe(true);
    code = (await created.json()).code;
    const path = `/api/rooms/${code}`;
    const snapshot = async (context: BrowserContext): Promise<RoomView> => {
      const response = await context.request.get(path);
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const send = async (context: BrowserContext, command: Command) => {
      const view = await snapshot(context);
      const response = await context.request.post(`${path}/commands`, {
        data: {
          requestId: randomUUID(),
          expectedRound: view.round,
          expectedStage: view.study!.market.stageKey,
          command,
        },
      });
      expect(response.ok(), await response.text()).toBe(true);
    };
    for (const nickname of ["BookA", "BookB"]) {
      const context = await browser.newContext({
        baseURL,
        viewport: { width: contexts.length ? 320 : 390, height: 844 },
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
    await send(page.context(), {
      type: "study-randomize",
      expectedRevision: 0,
    });
    const participants = await Promise.all(
      contexts.map(async (context) => ({
        context,
        view: await snapshot(context),
        page: await context.newPage(),
      })),
    );
    const buyer = participants.find((p) => p.view.me.role === "buyer")!;
    const seller = participants.find((p) => p.view.me.role === "seller")!;
    await send(page.context(), { type: "start" });
    await Promise.all(participants.map((p) => p.page.goto(`/room/${code}`)));
    const submit = seller.page.getByRole("button", {
      name: "指値注文",
      exact: true,
    });
    await expect(submit).toBeEnabled({ timeout: 20000 });
    for (const participant of participants) {
      const order = participant.page.getByRole("button", {
        name: "指値注文",
        exact: true,
      });
      await expect
        .poll(async () => (await order.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(24);
      expect(
        await participant.page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await seller.page.getByLabel(/1単位目の売りたい価格/).fill("100");
    await submit.click();
    await expect(
      seller.page
        .getByRole("region", { name: "売り注文一覧" })
        .locator(".study-own-order-tag"),
    ).toHaveText("あなた含む");
    const book = buyer.page.getByRole("region", { name: "売り注文一覧" });
    await expect(book).toContainText("100");
    await expect(
      book.getByRole("columnheader", { name: "参加者" }),
    ).toHaveCount(0);
    await expect(book.locator(".study-own-order-tag")).toHaveCount(0);
    await expect(buyer.page.locator(".private-panel")).toContainText("の条件");
    await buyer.page
      .getByRole("button", { name: "棒グラフ", exact: true })
      .click();
    await expect(buyer.page.locator(".study-book-chart")).toBeVisible();
    await buyer.page.getByRole("button", { name: "一覧", exact: true }).click();
    await expect(book).toContainText("100");
    await buyer.page
      .getByRole("button", { name: "成行注文", exact: true })
      .click();
    await expect
      .poll(async () => (await snapshot(buyer.context)).study!.myTrades.length)
      .toBe(1);
    const traded = await snapshot(buyer.context);
    expect(traded.study!.myTrades[0].price).toBe(100);
    await buyer.page.reload();
    await expect(
      buyer.page.getByRole("region", { name: "売り注文一覧" }),
    ).not.toContainText("100");
    await buyer.page.screenshot({
      path: info.outputPath("cda-shared-book.png"),
      fullPage: true,
    });
  } finally {
    for (const context of contexts) await context.close();
    if (code)
      expect(
        (
          await page.request.delete(`/api/rooms/${code}`, {
            data: { confirmed: true },
          })
        ).ok(),
      ).toBe(true);
  }
});
