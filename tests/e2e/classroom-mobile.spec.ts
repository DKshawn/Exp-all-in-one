import { expect, test } from "@playwright/test";
import { signInTeacher } from "./helpers/teacher-login";

for (const institution of ["CDA", "Call Market", "Posted Offer"]) {
  test(
    institution + " demo student controls reflow at phone sizes",
    async ({ page }, info) => {
      await signInTeacher(page.request);
      await page.clock.install();
      await page.goto("/demo");
      await page.getByRole("button", { name: "作成前に詳細を設定" }).click();
      const dialog = page.getByRole("dialog", { name: "実験の詳細設定" });
      for (const other of ["CDA", "Call Market", "Posted Offer"])
        if (other !== institution)
          await dialog
            .getByRole("checkbox", { name: other, exact: true })
            .uncheck();
      await dialog
        .getByRole("button", { name: "確定して次へ", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "確定して次へ", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "設定を保存して閉じる", exact: true })
        .click();
      await page
        .getByRole("button", { name: "ルーム作成", exact: true })
        .click();
      const next = page.getByRole("button", {
        name: "確定して次へ",
        exact: true,
      });
      for (let step = 0; step < 2 && (await next.isVisible()); step++)
        await next.click();
      await page
        .getByRole("spinbutton", { name: "入室受付時間（秒）" })
        .fill("5");
      await page.getByRole("button", { name: "締切タイマーを開始" }).click();
      await page.clock.fastForward(6000);
      await page
        .getByRole("button", { name: "実験を開始", exact: true })
        .click();
      await page.getByRole("button", { name: "学生画面を見る" }).click();
      await page.clock.fastForward(6000);
      for (const width of [320, 390, 760, 1440, 390]) {
        await page.setViewportSize({ width, height: 844 });
        const canvas = page.locator(".study-fit-canvas");
        if (width <= 760) {
          await expect(page.locator(".study-compact-viewport")).toBeVisible();
          await expect
            .poll(() =>
              page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
            )
            .toBe(true);
          for (const input of await canvas
            .locator(".study-order-form input:visible")
            .all()) {
            expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(
              24,
            );
          }
          const buttons = canvas.locator(".study-order-form button:visible");
          for (const b of await buttons.all()) {
            const box = (await b.boundingBox())!;
            expect(box.height).toBeGreaterThanOrEqual(24);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
          }
        } else
          await expect(page.locator(".study-compact-viewport")).toHaveCount(0);
      }
      await page
        .locator(".private-panel")
        .screenshot({ path: info.outputPath("mobile-order-panel.png") });
    },
  );
}

test("Judgment ranking supports pointer, keyboard and interruption", async ({
  page,
}) => {
  await signInTeacher(page.request);
  await page.goto("/judgment/demo");
  await page.locator('input[aria-describedby$="06-01-description"]').check();
  await page.getByRole("button", { name: "デモを開始", exact: true }).click();
  const token = page.locator('[data-rank-item="school"]');
  await token.scrollIntoViewIfNeeded();
  const target = page.locator('[data-rank-place="1"]').first();
  const a = (await token.boundingBox())!,
    b = (await target.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 40 });
  await page.mouse.up();
  await expect(page.locator('input[name="school"]')).toHaveValue("1");
  await token.press("Enter");
  await page.locator('[data-rank-place="2"]').first().press("Enter");
  await expect(page.locator('input[name="school"]')).toHaveValue("2");
  const rect = (await token.boundingBox())!;
  await page.mouse.move(rect.x + 10, rect.y + 10);
  await page.mouse.down();
  await page.mouse.move(rect.x + 30, rect.y + 30);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".ranking-ghost")).toHaveCount(0);
  await expect(page.locator('input[name="school"]')).toHaveValue("2");
});
