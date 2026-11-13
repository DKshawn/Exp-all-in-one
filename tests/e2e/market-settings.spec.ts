import { signInTeacher } from "./helpers/teacher-login";
import { expectCopiedJoinLink } from "./helpers/copy-join-link";
import { expect, test, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { RoomView } from "../../src/experiments/double-auction/lib/types";

test("teacher edits private market conditions, students receive them, and starting locks them", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInTeacher(page.request);
  const created = await page.request.post("/api/rooms", {
    data: {
      config: {
        title: "価値と費用の設定テスト",
        capacity: 12,
        rounds: 2,
        duration: 180,
      },
      password: "12345678",
    },
  });
  expect(created.ok()).toBe(true);
  const { code } = await created.json();
  const path = `/api/rooms/${code}`;
  const contexts: BrowserContext[] = [];
  try {
    const student = await browser.newContext({ baseURL });
    contexts.push(student);
    expect(
      (
        await student.request.post(`${path}/join`, {
          data: { nickname: "条件確認", pin: "1234" },
        })
      ).ok(),
    ).toBe(true);
    const studentPage = await student.newPage();
    await studentPage.goto(`/room/${code}`);
    await expect(studentPage.locator(".private-value")).toBeVisible();

    await page.setViewportSize({ width: 1440, height: 1080 });
    await page.goto(`/room/${code}?entry=teacher`);
    await expectCopiedJoinLink(page, `/?code=${code}`);
    await page.getByRole("button", { name: "設定を変更", exact: true }).click();
    const settingsPanel = page.getByRole("region", {
      name: "価値・費用の設定",
      exact: true,
    });
    const firstValue = page.getByRole("spinbutton", {
      name: "りんご 買い手の価値 1",
      exact: true,
    });
    await firstValue.fill("");
    await page
      .getByRole("button", { name: "価値と費用を保存", exact: true })
      .click();
    await expect(settingsPanel.getByRole("alert")).toHaveText(
      "すべての価値と費用を、1〜99999の整数で入力してください。",
    );
    const values = [120, 110, 100, 90, 80, 70];
    const costs = [70, 80, 90, 100, 110, 120];
    for (let i = 0; i < 6; i++) {
      await page
        .getByRole("spinbutton", {
          name: `りんご 買い手の価値 ${i + 1}`,
          exact: true,
        })
        .fill(String(values[i]));
      await page
        .getByRole("spinbutton", {
          name: `りんご 売り手の費用 ${i + 1}`,
          exact: true,
        })
        .fill(String(costs[i]));
    }
    await page
      .getByRole("spinbutton", { name: "バナナ 買い手の価値 1", exact: true })
      .fill("88");
    await page
      .getByRole("spinbutton", { name: "みかん 売り手の費用 1", exact: true })
      .fill("33");
    await expect(page.getByLabel("りんごの均衡プレビュー")).toContainText(
      "90〜100",
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1080 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1080 });
    await settingsPanel.screenshot({
      path: info.outputPath("market-settings-editor.png"),
    });
    await page
      .getByRole("button", { name: "価値と費用を保存", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "設定を変更", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(settingsPanel).toContainText("120 · 110 · 100 · 90 · 80 · 70");
    const saved: RoomView = await (await page.request.get(path)).json();
    const settings = saved.teacher!.marketSettings;
    expect(settings.apple).toEqual({ values, costs });
    expect(settings.banana.values[0]).toBe(88);
    expect(settings.orange.costs[0]).toBe(33);
    expect(saved.teacher!.equilibria.apple).toMatchObject({
      low: 90,
      high: 100,
      quantity: 3,
    });
    const studentView: RoomView = await (
      await student.request.get(path)
    ).json();
    expect(studentView.teacher).toBeUndefined();
    expect(JSON.stringify(studentView)).not.toMatch(
      /marketSettings|settingsRevision|schedules|equilibria/,
    );
    await expect(studentPage.locator(".private-value")).toContainText(
      String(studentView.me.limits!.apple),
    );
    await expect(
      studentPage.getByRole("button", { name: "設定を変更", exact: true }),
    ).toHaveCount(0);

    const update = {
      requestId: randomUUID(),
      expectedRound: 0,
      command: {
        type: "update-markets",
        settings,
        expectedRevision: saved.teacher!.settingsRevision,
      },
    };
    expect(
      (
        await student.request.post(`${path}/commands`, { data: update })
      ).status(),
    ).toBe(403);
    const invalid = structuredClone(update);
    invalid.command.settings.apple.values[0] = 100000;
    expect(
      (await page.request.post(`${path}/commands`, { data: invalid })).status(),
    ).toBe(400);
    const exported = await (
      await page.request.get(`${path}/export?kind=settings`)
    ).json();
    expect(exported.marketSettings).toEqual(settings);
    const events = await (
      await page.request.get(`${path}/export?kind=events`)
    ).text();
    expect(events).toContain("market-settings-updated");

    // A second teacher tab may save first: the open editor must not overwrite it.
    await page.getByRole("button", { name: "設定を変更", exact: true }).click();
    const concurrent = structuredClone(update);
    concurrent.command.settings.banana.values[0] = 89;
    expect(
      (await page.request.post(`${path}/commands`, { data: concurrent })).ok(),
    ).toBe(true);
    await expect(settingsPanel.getByRole("alert")).toContainText(
      "別の画面で設定が更新されました",
    );
    await expect(
      page.getByRole("button", { name: "価値と費用を保存", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await expect(settingsPanel).toContainText("89 ·");

    for (let i = 1; i < 12; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect(
        (
          await context.request.post(`${path}/join`, {
            data: { nickname: `学生${i}`, pin: "1234" },
          })
        ).ok(),
      ).toBe(true);
    }
    const start = page.getByRole("button", { name: "実験を開始", exact: true });
    await expect(start).toBeEnabled();
    await page.getByRole("button", { name: "設定を変更", exact: true }).click();
    await expect(start).toBeDisabled();
    await page.getByRole("button", { name: "キャンセル", exact: true }).click();
    await start.click();
    await expect(settingsPanel).toContainText("実験開始後は変更できません");
    await expect(
      page.getByRole("button", { name: "設定を変更", exact: true }),
    ).toHaveCount(0);
    const locked = {
      ...update,
      requestId: randomUUID(),
      expectedRound: 1,
      command: { ...update.command, expectedRevision: 2 },
    };
    expect(
      (await page.request.post(`${path}/commands`, { data: locked })).status(),
    ).toBe(409);
    expect(errors).toEqual([]);
  } finally {
    for (const context of contexts) await context.close();
  }
});
