import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { verificationTarget } from "../../scripts/verification-target";
import { enterTeacherPage } from "./helpers/teacher-login";
import { expectEndButton } from "./helpers/end-experiment";
import type {
  RequestCommand,
  SessionView,
} from "../../src/experiments/emh/session-types";
import type { EmhSettings } from "../../src/experiments/emh/settings";

test("EMH conditions persist, lock with allocation, and govern six rounds and exports", async ({
  page,
  browser,
  baseURL,
}, info) => {
  // Remote verification must be explicitly targeted; never reuse real rooms.
  const { accessKey } = verificationTarget("E2E_BASE_URL");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const contexts: BrowserContext[] = [];
  let code: string | undefined;
  const settings: EmhSettings = {
    initialUnits: 4,
    targetMarketSize: 8,
    typeRatios: [2, 1, 1],
    periodSeconds: 120,
    rounds: 6,
    unitSeconds: 30,
    breakSeconds: 60,
  };
  try {
    await page.goto("/teacher?experiment=emh");
    await enterTeacherPage(page);
    await page.getByLabel("実験名", { exact: true }).fill("EMH 設定検証");
    await page.locator('[name="initialUnits"]').fill("5");
    await page.locator('[name="targetMarketSize"]').fill("8");
    await page.locator('[name="periodMinutes"]').fill("3");
    await page.locator('[name="typeRatio1"]').fill("2");
    await page
      .getByLabel("教員パスワード", { exact: false })
      .fill("Emh-Settings-Verification");
    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "ルームを作成", exact: true })
      .click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+\?entry=teacher/);
    code = new URL(page.url()).pathname.split("/")[2];
    const path = `/api/rooms/${code}`;
    const state = async (
      request = page.request,
      role = "teacher",
    ): Promise<SessionView> => {
      const response = await request.get(`${path}/emh?session=${role}`);
      expect(response.ok()).toBe(true);
      return (await response.json()).state;
    };
    const command = async (
      input: RequestCommand,
      request: APIRequestContext = page.request,
      role = "teacher",
    ) => {
      const response = await request.post(`${path}/emh?session=${role}`, {
        data: input,
      });
      expect(response.ok(), await response.text()).toBe(true);
      return (await response.json()).state as SessionView;
    };
    const exported = async () =>
      (
        await page.request.get(
          `${path}/emh/export?session=teacher&kind=conditions`,
        )
      ).json();
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("5");

    const student = await browser.newContext({ baseURL });
    contexts.push(student);
    const studentPage = await student.newPage();
    studentPage.on("pageerror", (error) => errors.push(error.message));
    await studentPage.goto(`/?code=${code}`);
    await studentPage.locator('[name="nickname"]').fill("条件確認");
    await studentPage.locator('[name="pin"]').fill("1234");
    await studentPage
      .getByRole("button", { name: "入室する", exact: true })
      .click();
    await expect(studentPage).toHaveURL(new RegExp(`/room/${code}`));
    await expect(studentPage.locator(".student-waiting-card")).toContainText(
      "入室が完了しました",
    );
    await expect(studentPage.locator(".student-waiting-card")).toContainText(
      "教員が受付を終了するまで",
    );
    for (let i = 1; i < 8; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect(
        (
          await context.request.post(`${path}/join`, {
            data: { nickname: `検証${i}`, pin: "1234" },
          })
        ).ok(),
      ).toBe(true);
    }
    await expect(
      page.getByRole("heading", { name: "8人が入室", exact: true }),
    ).toBeVisible();
    const assign = page.getByRole("button", {
      name: "分け方を確定して受付終了",
      exact: true,
    });
    await page.locator('[name="initialUnits"]').fill("4");
    await page.locator('[name="periodMinutes"]').fill("2");
    await expect(assign).toBeDisabled();
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(assign).toBeEnabled();
    await page.reload();
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("4");
    await expect(page.locator('[name="periodMinutes"]')).toHaveValue("2");
    await expect(page.locator(".emh-allocation")).toContainText("4 / 2 / 2");
    await expect(page.locator(".emh-allocation")).toContainText(
      "総証券数 32単位",
    );
    expect((await state()).settings).toEqual(settings);

    // A stale form must not silently overwrite settings saved in another tab.
    await page.locator('[name="initialUnits"]').fill("6");
    await command({
      scope: "session",
      requestId: randomUUID(),
      command: {
        kind: "update-settings",
        settings: { ...settings, initialUnits: 7 },
        expectedRevision: (await state()).revision,
      },
    });
    await expect(
      page.locator(".emh-session-settings").getByRole("alert"),
    ).toContainText("別の画面で設定が更新されました");
    await expect(
      page.getByRole("button", { name: "設定を保存", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "変更を取り消す", exact: true })
      .click();
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("7");
    await page.locator('[name="initialUnits"]').fill("4");
    await page.getByRole("button", { name: "設定を保存", exact: true }).click();
    await expect(assign).toBeEnabled();
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await page
      .locator(".emh-session-settings")
      .screenshot({ path: info.outputPath("emh-settings.png") });
    await assign.click();
    await expect(studentPage.locator(".student-waiting-card")).toContainText(
      "市場 1 に参加します",
    );
    await expect(
      page.getByRole("heading", { name: "確定した実験条件" }),
    ).toBeVisible();
    await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
    const assigned = await exported();
    expect(assigned.settings).toEqual(settings);
    expect(assigned.settingsLockedAt).toBeGreaterThan(0);
    expect(assigned.markets[0].conditions.typeCounts).toEqual([4, 2, 2]);
    const denied = await page.request.post(`${path}/emh?session=teacher`, {
      data: {
        scope: "session",
        requestId: randomUUID(),
        command: {
          kind: "update-settings",
          settings: { ...settings, initialUnits: 9 },
          expectedRevision: (await state()).revision,
        },
      },
    });
    expect(denied.status()).toBe(409);
    await page.reload();
    expect((await exported()).markets).toEqual(assigned.markets);

    await page
      .getByRole("button", { name: "割り当てを解除", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "戻る", exact: true })
      .click();
    expect((await state()).status).toBe("assigned");
    await page
      .getByRole("button", { name: "割り当てを解除", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "解除して受付再開", exact: true })
      .click();
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("4");
    expect((await state()).settingsLockedAt).toBeNull();
    await assign.click();
    await expect(
      page.getByRole("heading", { name: "確定した実験条件" }),
    ).toBeVisible();
    const confirmed = await exported();
    await page
      .getByRole("button", { name: "全市場で実験を開始", exact: true })
      .click();
    await expect(page.locator(".emh-session-controls")).toBeVisible();
    await expect(studentPage.locator(".student-waiting-card")).toHaveCount(0);
    await expect(studentPage.locator(".emh-student-view")).toBeVisible();
    await expect(page.locator(".emh-countdown-card")).toHaveCount(0);
    await expect(studentPage.locator(".emh-countdown-card")).toContainText(
      "まもなく実験が始まります",
    );
    await expect(
      studentPage.getByText("開始まで", { exact: true }),
    ).toBeVisible();
    await expect(studentPage.getByLabel("買値（円）")).toBeDisabled();
    await expect(studentPage.getByLabel("買値（円）")).toBeEnabled({
      timeout: 12000,
    });
    await expect(studentPage.locator(".emh-countdown-card")).toHaveCount(0);
    await expect(
      studentPage.getByRole("heading", { name: "注文板" }),
    ).toBeVisible();
    await expect(
      studentPage.getByRole("heading", { name: "取引記録" }),
    ).toBeVisible();
    await expect(
      studentPage.getByRole("heading", { name: "配当・損益の記録" }),
    ).toBeVisible();
    await expect(studentPage.getByRole("tab", { name: "市場" })).toHaveCount(0);
    await expect(
      studentPage.getByRole("tab", { name: "自分の記録" }),
    ).toHaveCount(0);
    const buyColumn = studentPage.locator(".student-action-column.buy-side");
    const sellColumn = studentPage.locator(".student-action-column.sell-side");
    await buyColumn.getByLabel("買値（円）").fill("1");
    await sellColumn.getByLabel("売値（円）").fill("99999");
    await buyColumn.getByRole("button", { name: "買い指値注文" }).click();
    await expect(
      studentPage
        .locator(".study-order-book")
        .getByRole("button", { name: "買値を取り消す" }),
    ).toBeVisible();
    await sellColumn.getByRole("button", { name: "売り指値注文" }).click();
    await expect(
      studentPage
        .locator(".study-order-book")
        .getByRole("button", { name: "売値を取り消す" }),
    ).toBeVisible();
    await studentPage
      .locator(".study-order-book")
      .getByRole("button", { name: "買値を取り消す" })
      .click();
    await studentPage
      .locator(".study-order-book")
      .getByRole("button", { name: "売値を取り消す" })
      .click();
    expect((await exported()).markets[0].conditions.assignment).toEqual(
      confirmed.markets[0].conditions.assignment,
    );
    const active = await state();
    expect(active.market!.periodSeconds).toBe(120);
    expect(
      active.market!.participants.reduce((total, p) => total + p.holdings, 0),
    ).toBe(32);
    const privateState = await state(student.request, "student");
    expect(privateState.settings).toBeNull();
    expect(privateState.market!.initialUnits).toBe(4);
    expect(privateState.market!.me!.holdings).toBe(4);
    expect(privateState.market!.conditions).toBeNull();
    await studentPage.reload();
    await expect(studentPage.locator(".emh-app")).toBeVisible();
    expect((await state(student.request, "student")).market!.me).toEqual(
      privateState.market!.me,
    );

    const quote = await command(
      {
        scope: "market",
        marketId: 1,
        requestId: randomUUID(),
        action: {
          kind: "quote",
          side: "ask",
          price: 300,
          unitKey: privateState.market!.unitKey,
        },
      },
      student.request,
      "student",
    );
    const buy: RequestCommand = {
      scope: "market",
      marketId: 1,
      requestId: randomUUID(),
      action: {
        kind: "accept",
        side: "ask",
        quoteId: quote.market!.ask!.id,
        unitKey: quote.market!.unitKey,
      },
    };
    await command(buy, contexts[1].request, "student");
    await command(buy, contexts[1].request, "student");
    expect((await state()).market!.trades).toHaveLength(1);
    expect((await state(student.request, "student")).market!.me!.holdings).toBe(
      3,
    );
    expect(
      (await state(contexts[1].request, "student")).market!.me!.holdings,
    ).toBe(5);

    // Finish all six rounds through authenticated commands, using each phase token.
    for (let i = 0; i < 18; i++) {
      const current = (await state()).market!;
      if (current.status === "completed") break;
      if (
        current.status === "trading" &&
        current.year === 6 &&
        current.period === "B"
      ) {
        await (await expectEndButton(page)).click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "終了する" })
          .click();
        await expect.poll(async () => (await state()).status).toBe("completed");
        break;
      }
      await command({
        scope: "market",
        marketId: 1,
        requestId: randomUUID(),
        action: {
          kind: current.status === "break" ? "next-year" : "end-period",
          expectedPhase: current.phaseKey,
        },
      });
    }
    const complete = await state();
    expect(complete.status).toBe("completed");
    expect(complete.market!.results).toHaveLength(12);
    expect(complete.market!.results.at(-1)!.reason).toBe("teacher-finish");
    for (const result of complete.market!.results) {
      const dividends =
        result.period === "A" ? [216, 200, 257] : [105, 110, 83];
      const baseline =
        4 * (4 * dividends[0] + 2 * dividends[1] + 2 * dividends[2]);
      expect(result.initialDividend).toBe(baseline);
      expect(result.maxDividend).toBe(32 * Math.max(...dividends));
      expect(result.actualDividend).toBe(
        result.payouts.reduce((sum, p) => sum + p.dividend, 0),
      );
      expect(result.allocationEfficiency).toBeCloseTo(
        result.actualDividend / result.maxDividend,
      );
      expect(result.gainEfficiency).toBeCloseTo(
        (result.actualDividend - baseline) / (result.maxDividend - baseline),
      );
      if (result.year > 1) expect(result.actualDividend).toBe(baseline);
    }
    const personal = await student.request.get(
      `${path}/emh/export?session=student&kind=personal`,
    );
    expect(personal.ok()).toBe(true);
    expect(await personal.text()).toContain("条件確認");
    expect(
      (
        await student.request.get(
          `${path}/emh/export?session=student&kind=conditions`,
        )
      ).status(),
    ).toBe(403);
    await page.reload();
    await page.getByText("全市場のデータを保存", { exact: true }).click();
    const csvDownload = page.waitForEvent("download");
    await page
      .locator(".emh-all-exports")
      .getByRole("link", { name: "期別集計", exact: true })
      .click();
    const download = await csvDownload;
    const file = info.outputPath("results.csv");
    await download.saveAs(file);
    const csv = readFileSync(file, "utf8");
    expect(csv.trim().split("\r\n")).toHaveLength(13);
    expect(csv).toContain('"initial_units","total_units","period_seconds"');
    expect(csv).toContain('"8","4","32","120"');
    const finalConditions = await exported();
    expect(finalConditions.settings).toEqual(settings);
    expect(finalConditions.settingsLockedAt).toBe(confirmed.settingsLockedAt);
    expect(finalConditions.markets[0].conditions.rules.totalUnits).toBe(32);
    await info.attach("conditions.json", {
      body: JSON.stringify(finalConditions, null, 2),
      contentType: "application/json",
    });
    expect(errors).toEqual([]);
  } finally {
    if (code) {
      const cleanup = await page.request.delete(`/api/rooms/${code}`, {
        data: { accessKey, confirmed: true },
      });
      expect
        .soft(cleanup.ok(), "Remove only the room created by this test")
        .toBe(true);
    }
    for (const context of contexts) await context.close();
  }
});
