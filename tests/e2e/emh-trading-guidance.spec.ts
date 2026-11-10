import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { verificationTarget } from "../../scripts/verification-target";
import {
  DEFAULT_SETTINGS,
  EXP2_SETTINGS,
} from "../../src/experiments/emh/settings";
import type { SessionView } from "../../src/experiments/emh/session-types";
import type { Action } from "../../src/experiments/emh/types";

for (const experiment of ["exp1", "exp2"] as const) {
  test(`${experiment} formal market protects identities and distinguishes final earnings`, async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const { accessKey } = verificationTarget("E2E_BASE_URL");
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    let code: string | undefined;
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      expect(
        (
          await page.request.post("/api/teacher/session", {
            data: { accessKey },
          })
        ).ok(),
      ).toBe(true);
      const created = await page.request.post("/api/emh/rooms", {
        data: {
          title: "EMH trading guidance verification",
          password: "Guidance-check-only",
          experiment,
          settings: {
            ...structuredClone(
              experiment === "exp1" ? DEFAULT_SETTINGS : EXP2_SETTINGS,
            ),
            initialUnits: 1,
            targetMarketSize: 3,
            unitSeconds: 120,
            periodSeconds: 600,
            rounds: 1,
          },
        },
      });
      expect(created.ok(), await created.text()).toBe(true);
      code = (await created.json()).code;
      const path = `/api/rooms/${code}`;
      for (let index = 0; index < 3; index++) {
        const context = await browser.newContext({ baseURL });
        contexts.push(context);
        expect(
          (
            await context.request.post(`${path}/join`, {
              data: { nickname: `UI${index + 1}`, pin: "2468" },
            })
          ).ok(),
        ).toBe(true);
      }
      const state = async (
        request: APIRequestContext = page.request,
        role = "teacher",
      ): Promise<SessionView> => {
        const result = await request.get(`${path}/emh?session=${role}`);
        expect(result.ok()).toBe(true);
        return (await result.json()).state;
      };
      const session = async (kind: "assign" | "start") => {
        const response = await page.request.post(
          `${path}/emh?session=teacher`,
          {
            data: {
              scope: "session",
              requestId: randomUUID(),
              command: { kind, expectedRevision: (await state()).revision },
            },
          },
        );
        expect(response.ok(), await response.text()).toBe(true);
      };
      const send = async (
        request: APIRequestContext,
        role: string,
        action: Action,
      ) => {
        const result = await request.post(`${path}/emh?session=${role}`, {
          data: {
            scope: "market",
            marketId: 1,
            requestId: randomUUID(),
            action,
          },
        });
        expect(result.ok(), await result.text()).toBe(true);
        return (await result.json()).state as SessionView;
      };
      const quote = async (
        index: number,
        side: "bid" | "ask",
        price: number,
      ) => {
        const request = contexts[index]!.request;
        return send(request, "student", {
          kind: "quote",
          side,
          price,
          unitKey: (await state(request, "student")).market!.unitKey,
        });
      };
      const control = async (kind: "pause" | "resume" | "end-period") =>
        send(page.request, "teacher", {
          kind,
          expectedPhase: (await state()).market!.phaseKey,
        });
      await session("assign");
      const student = await contexts[0]!.newPage();
      student.on("pageerror", (error) => errors.push(error.message));
      await student.setViewportSize({ width: 1440, height: 1000 });
      await student.goto(`/room/${code}`);
      await session("start");
      const conditions = student.locator(".emh-conditions");
      await expect(conditions).toHaveClass(/study-conditions-review/);
      await expect(conditions.locator(".study-conditions-arrow")).toBeVisible();
      const countdownBounds = await conditions.boundingBox();
      await expect(student.locator(".emh-countdown-card")).toHaveCount(0, {
        timeout: 12000,
      });
      await expect(conditions).not.toHaveClass(/study-conditions-review/);
      const tradingBounds = await conditions.boundingBox();
      expect(Math.abs(countdownBounds!.x - tradingBounds!.x)).toBeLessThan(1);
      expect(
        Math.abs(countdownBounds!.width - tradingBounds!.width),
      ).toBeLessThan(1);
      await expect
        .poll(async () => (await state()).market?.status)
        .toBe("trading");
      await page.goto(`/room/${code}?entry=teacher`);
      const bid = student.getByLabel("買値（円）", { exact: true });
      const ask = student.getByLabel("売値（円）", { exact: true });
      const buy = student.locator(".buy-side");
      await expect(bid).toBeEnabled();
      await expect(student.locator(".market-note")).not.toContainText(
        "最初の提示",
      );
      await expect(student.locator(".history-panel .chart-wrap")).toHaveCount(
        0,
      );
      await expect(page.locator(".history-panel .chart-wrap")).toBeVisible();
      await expect(student.locator(".trading-clock-rule")).toContainText(
        "1取引につき1単位",
      );
      if (experiment === "exp1") {
        await expect(student.locator(".emh-conditions")).toContainText(
          "非公開",
        );
        await expect(student.locator(".emh-personal-score-note")).toContainText(
          "B期末に確定",
        );
      }
      await expect(student.locator(".order-rules, .order-outcome")).toHaveCount(
        0,
      );
      const buttons = student.locator(
        ".emh-conditions .study-market-order > button",
      );
      await expect(buttons).toHaveCount(4);
      await expect(student.locator(".own-quote-status")).toHaveCount(0);
      for (const side of ["buy", "sell"]) {
        const pair = student.locator(
          `.student-action-column.${side}-side .emh-order-actions button`,
        );
        const [limit, market] = await Promise.all([
          pair.nth(0).boundingBox(),
          pair.nth(1).boundingBox(),
        ]);
        expect(limit).not.toBeNull();
        expect(market).not.toBeNull();
        expect(Math.abs(limit!.y - market!.y)).toBeLessThan(2);
        expect(limit!.x + limit!.width).toBeLessThanOrEqual(market!.x + 1);
      }
      for (const button of await buttons.all()) {
        await expect(button).toHaveCSS("justify-content", "center");
        await expect(button).toHaveCSS("text-align", "center");
      }
      await bid.fill("100");
      await buy
        .getByRole("button", { name: "買い指値注文", exact: true })
        .click();
      const book = student.locator(".study-order-book");
      await expect(
        book.getByRole("button", { name: "買値を取り消す", exact: true }),
      ).toBeVisible();
      const bids = book.getByRole("region", { name: "買い注文一覧" });
      const asks = book.getByRole("region", { name: "売り注文一覧" });
      const list = book.getByRole("button", { name: "一覧", exact: true });
      const chart = book.getByRole("button", { name: "棒グラフ", exact: true });
      await expect(list).toHaveAttribute("aria-pressed", "true");
      await expect(bids.locator("tr.study-own-order")).toContainText(
        "100あなた含む",
      );
      await ask.fill("200");
      await student
        .getByRole("button", { name: "売り指値注文", exact: true })
        .click();
      await expect(asks.locator("tr.study-own-order")).toContainText(
        "200あなた含む",
      );
      const otherStudent = await contexts[1]!.newPage();
      await otherStudent.goto(`/room/${code}`);
      const otherBook = otherStudent.locator(".study-order-book");
      await expect(
        otherBook.getByRole("region", { name: "売り注文一覧" }),
      ).toContainText("200");
      await expect(otherBook.locator("tr.study-own-order")).toHaveCount(0);
      await otherBook
        .getByRole("button", { name: "棒グラフ", exact: true })
        .click();
      await expect(
        otherBook.getByRole("img", {
          name: "200円、買い0単位、売り1単位",
          exact: true,
        }),
      ).toBeVisible();
      await expect(otherBook.locator(".study-book-chart-own-dot")).toHaveCount(
        0,
      );
      const teacherBook = page.locator(".study-order-book");
      for (const orderBook of [teacherBook, book]) {
        for (const side of ["買い注文一覧", "売り注文一覧"]) {
          const table = orderBook.getByRole("region", { name: side });
          await expect(table.getByRole("columnheader")).toHaveText([
            "価格（円）",
            "数量",
          ]);
          await expect(
            table.getByRole("columnheader", { name: "価格（円）" }),
          ).toHaveCSS("white-space", "nowrap");
          await expect(
            table.locator("tbody tr").first().getByRole("cell"),
          ).toHaveCount(2);
        }
      }
      await expect(teacherBook).not.toContainText("被験者 #");
      await expect(teacherBook.locator(".study-own-order-tag")).toHaveCount(0);
      await chart.click();
      const chartRows = book.getByRole("region", {
        name: "価格別の注文数量の棒グラフ",
      });
      await expect(
        chartRows.getByRole("img", {
          name: "100円、買い1単位、売り0単位、あなたの注文1単位を含む",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        chartRows.getByRole("img", {
          name: "200円、買い0単位、売り1単位、あなたの注文1単位を含む",
          exact: true,
        }),
      ).toBeVisible();
      await expect(chartRows.locator(".study-book-chart-own-dot")).toHaveCount(
        2,
      );
      await expect(chartRows.locator(".study-book-chart-own")).toHaveCount(2);
      await quote(1, "bid", 101);
      await expect(
        chartRows.getByRole("img", {
          name: "101円、買い1単位、売り0単位",
          exact: true,
        }),
      ).toBeVisible();
      await expect(chartRows.locator(".study-book-chart-own-dot")).toHaveCount(
        2,
      );
      await list.click();
      await quote(1, "ask", 190);
      await student.reload();
      const bidPrices = bids.locator(
        "tbody tr:not(.study-book-placeholder) td:first-child",
      );
      const askPrices = asks.locator(
        "tbody tr:not(.study-book-placeholder) td:first-child",
      );
      await expect(bidPrices).toHaveText(["101", /100.*あなた含む/]);
      await expect(askPrices).toHaveText(["190", /200.*あなた含む/]);
      await book
        .getByRole("button", { name: "売値を取り消す", exact: true })
        .click();
      await expect(askPrices).toHaveText(["190"]);
      await expect(book.locator(".study-own-order-tag")).toHaveCount(1);
      const other = (await state(contexts[1]!.request, "student")).market!;
      for (const side of ["bid", "ask"] as const) {
        await send(contexts[1]!.request, "student", {
          kind: "cancel",
          side,
          quoteId: other[side]!.id,
          unitKey: other.unitKey,
        });
      }
      await expect(bidPrices).toHaveText([/100.*あなた含む/]);
      await bid.fill("99");
      await buy
        .getByRole("button", { name: "買い指値注文", exact: true })
        .click();
      await expect(bidPrices).toHaveText([/99.*あなた含む/]);
      await book.getByRole("button", { name: "買値を取り消す" }).click();
      await student.reload();
      await expect(book.getByRole("button", { name: /取り消す/ })).toHaveCount(
        0,
      );
      await expect(book.locator(".study-own-order-tag")).toHaveCount(0);
      await quote(1, "ask", 177);
      await expect(
        otherBook.getByRole("img", {
          name: "177円、買い0単位、売り1単位、あなたの注文1単位を含む",
          exact: true,
        }),
      ).toBeVisible();
      const standing = (await state(contexts[2]!.request, "student")).market!;
      expect(standing.ask!.participantId).toBeNull();
      expect(standing.ask!.seat).toBeNull();
      await expect(
        student.getByRole("region", { name: "売り注文一覧" }),
      ).toContainText("177");
      await bid.fill("180");
      await expect(student.locator(".emh-conditions")).not.toContainText(
        "見込利益",
      );
      await student.locator(".emh-conditions").screenshot({
        path: info.outputPath(`${experiment}-orders-desktop.png`),
      });
      await buy
        .getByRole("button", { name: "買い指値注文（即時成立）", exact: true })
        .click();
      await expect(student.locator(".personal-trade-feedback")).toContainText(
        "177円で買いました",
      );
      await expect(
        book.getByRole("button", { name: "買値を取り消す" }),
      ).toHaveCount(0);
      await expect(
        book.locator("tbody tr:not(.study-book-placeholder)"),
      ).toHaveCount(0);
      const after = (await state(contexts[0]!.request, "student")).market!;
      await expect(otherBook.locator(".study-book-chart-empty")).toBeVisible();
      await expect(otherBook.locator(".study-book-chart-own-dot")).toHaveCount(
        0,
      );
      expect(after.me!.holdings).toBe(2);
      expect(after.me!.cash).toBe(-177);
      expect(after.ownQuotes?.bid.status).toBe("filled");
      expect(after.trades[0]!.sellerId).toBeNull();
      expect(after.trades[0]!.sellerSeat).toBeNull();
      const buyerSeat = after.me!.seat;
      const sellerSeat = other.me!.seat;
      const teacherTrade = page
        .locator(".history-panel .trade-table tbody tr")
        .first();
      await expect(teacherTrade.getByRole("cell")).toHaveText([
        "1",
        ...(experiment === "exp1" ? ["A"] : []),
        "177",
        `#${buyerSeat}`,
        `#${sellerSeat}`,
      ]);
      const late = await contexts[2]!.request.post(
        `${path}/emh?session=student`,
        {
          data: {
            scope: "market",
            marketId: 1,
            requestId: randomUUID(),
            action: {
              kind: "accept",
              side: "ask",
              quoteId: standing.ask!.id,
              unitKey: standing.unitKey,
            },
          },
        },
      );
      expect(late.status()).toBe(409);
      expect((await state()).market!.trades).toHaveLength(1);
      await student.screenshot({
        path: info.outputPath(`${experiment}-student-desktop.png`),
        fullPage: true,
      });
      await ask.fill("220");
      const lower = (await quote(1, "bid", 100)).market!.ownQuotes!.bid.quoteId;
      expect(lower).toBeTruthy();
      await quote(2, "bid", 101);
      for (let count = 0; count < 2; count++) {
        await expect(bidPrices.first()).toHaveText(count === 0 ? "101" : "100");
        expect(
          (await state(contexts[1]!.request, "student")).market!.ownQuotes!.bid
            .quoteId,
        ).toBe(lower);
        await student
          .locator(".sell-side")
          .getByRole("button", { name: "売り成行注文", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await state(contexts[0]!.request, "student")).market!.me!
                .holdings,
          )
          .toBe(1 - count);
      }
      await expect(ask).toBeDisabled();
      await expect(bid).toBeEnabled();
      await expect(
        student.locator(".sell-side .study-market-order small"),
      ).toHaveCount(0);
      await expect(
        student.getByRole("button", { name: "売り指値注文", exact: true }),
      ).toBeDisabled();
      await expect(
        student.getByRole("button", { name: "売り成行注文", exact: true }),
      ).toBeDisabled();
      await expect(ask).toHaveValue("220");
      await bid.fill("100");
      await quote(1, "ask", 90);
      await expect(asks).toContainText("90");
      await expect(bid).toHaveValue("100");
      await quote(2, "bid", 90);
      await expect(
        student.getByRole("button", { name: "全体 4件", exact: true }),
      ).toBeVisible();
      await expect(bid).toHaveValue("100");
      await expect(bid).toBeFocused();
      await expect(bids.locator(".study-own-order-tag")).toHaveCount(0);
      await buy
        .getByRole("button", { name: "買い指値注文", exact: true })
        .click();
      await expect(bids.locator("tr.study-own-order")).toContainText(
        "100あなた含む",
      );
      await student
        .getByRole("button", { name: "自分の売買 3件", exact: true })
        .click();
      await expect(student.locator(".trade-table tbody tr")).toHaveCount(3);
      await expect(student.locator(".trade-table")).not.toContainText("UI2");
      const observerTrade = (
        await state(contexts[0]!.request, "student")
      ).market!.trades.at(-1)!;
      expect(observerTrade.buyerId).toBeNull();
      expect(observerTrade.sellerId).toBeNull();
      await control("pause");
      await expect(bid).toBeDisabled();
      await control("resume");
      await expect(bid).toBeEnabled();
      await control("end-period");
      await expect(book.locator(".study-own-order-tag")).toHaveCount(0);
      await expect(book.getByRole("button", { name: /取り消す/ })).toHaveCount(
        0,
      );
      if (experiment === "exp1") {
        await expect(student.locator(".score-status.provisional")).toHaveText(
          "暫定",
        );
        await expect(bid).toHaveValue("");
        await expect(ask).toHaveValue("");
        await quote(2, "ask", 100);
        await expect(student.locator(".emh-conditions")).not.toContainText(
          "見込利益",
        );
        await buy
          .getByRole("button", { name: "買い成行注文", exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (await state(contexts[0]!.request, "student")).market!.me!
                .holdings,
          )
          .toBe(1);
        await control("end-period");
      }
      await expect(student.locator(".score-status.final")).toHaveText("確定");
      await expect(
        student.getByText("ラウンド損益（確定）", { exact: true }),
      ).toBeVisible();
      const final = (await state(contexts[0]!.request, "student")).market!;
      const expected =
        experiment === "exp1" ? -76 + final.me!.dividends!.b : 24;
      expect(final.me!.totalProfit).toBe(expected);
      const exported = await page.request.get(
        `${path}/emh/export?session=teacher&kind=trades`,
      );
      expect(exported.ok()).toBe(true);
      const [csvHeader, firstTrade] = (await exported.text()).split(/\r?\n/);
      expect(csvHeader).toContain('"buyer","seller","price","quantity"');
      expect(firstTrade).toContain(`"${buyerSeat}","${sellerSeat}","177","1"`);
      await student.reload();
      await expect(student.locator(".score-status.final")).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      if (code)
        expect(
          (
            await page.request.delete(`/api/rooms/${code}?session=teacher`, {
              data: { confirmed: true },
            })
          ).ok(),
        ).toBe(true);
      for (const context of contexts) await context.close();
    }
  });
}
