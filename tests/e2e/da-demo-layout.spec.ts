import { expect, test, type Page } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

async function expectToolbarBelowHeader(page: Page) {
  const header = page.locator(".study-shell > header");
  const toolbar = page.getByRole("region", { name: "ひとりデモの操作" });
  for (const width of [1366, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(header).toBeVisible();
    await expect(toolbar).toBeVisible();
    const headerBox = await header.boundingBox();
    const toolbarBox = await toolbar.boundingBox();
    expect(toolbarBox!.y).toBeGreaterThanOrEqual(
      headerBox!.y + headerBox!.height,
    );
  }
  await page.setViewportSize({ width: 1366, height: 900 });
}

test("DA demo settings use the demo palette and toolbar follows the header", async ({
  page,
}) => {
  await page.goto("/demo");
  await enterTeacherPage(page);
  await page.getByRole("button", { name: "作成前に詳細を設定" }).click();
  const dialog = page.getByRole("dialog", { name: "実験の詳細設定" });
  await expect(
    dialog.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toHaveCSS("background-color", "rgb(255, 243, 207)");
  await dialog.getByRole("button", { name: "確定して次へ" }).click();
  await dialog.getByRole("button", { name: "確定して次へ" }).click();
  await dialog
    .getByRole("combobox", { name: "供需プリセット" })
    .selectOption("overlap");
  await expect(
    dialog.locator(".study-equilibrium-comparison tbody tr").last(),
  ).toHaveCSS("background-color", "rgb(255, 243, 207)");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  await expectToolbarBelowHeader(page);
  await expect(
    page.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toHaveCSS("background-color", "rgb(255, 243, 207)");
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expectToolbarBelowHeader(page);
  await page.getByRole("button", { name: "教員画面を見る" }).click();
  await page.getByRole("button", { name: "確定して次へ", exact: true }).click();
  await page.getByRole("button", { name: "確定して次へ", exact: true }).click();
  await page.getByRole("spinbutton", { name: "入室受付時間（秒）" }).fill("5");
  await page.getByRole("button", { name: "締切タイマーを開始" }).click();
  await expect(page.getByRole("button", { name: "実験を開始" })).toBeEnabled();
  await page.getByRole("button", { name: "実験を開始" }).click();
  await expectToolbarBelowHeader(page);
  const roster = page.getByRole("region", { name: /^学生の割り当て/ });
  const openRoster = roster.getByRole("button", { name: "割り当てを表示" });
  await expect(openRoster).toHaveAttribute("aria-expanded", "false");
  await expect(roster.locator(".study-roster-content")).toBeHidden();
  await openRoster.click();
  const closeRoster = roster.getByRole("button", {
    name: "割り当てを折りたたむ",
  });
  await expect(closeRoster).toHaveAttribute("aria-expanded", "true");
  await expect(roster.locator(".study-roster-content")).toBeVisible();
  await closeRoster.click();
  await expect(roster.locator(".study-roster-content")).toBeHidden();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expectToolbarBelowHeader(page);
});

test("DA size preview keeps the demo toolbar outside the simulated screen", async ({
  page,
}) => {
  await page.goto("/demo/preview");
  await enterTeacherPage(page);
  const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
  await frame.getByRole("button", { name: "ルーム作成", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "ひとりデモの操作" }),
  ).toBeVisible();
  await expect(
    frame.getByRole("region", { name: "ひとりデモの操作" }),
  ).toHaveCount(0);
  await expect(frame.locator(".study-shell > header")).toBeVisible();
});
