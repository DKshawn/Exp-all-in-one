import { signInTeacher } from "./helpers/teacher-login";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await signInTeacher(page.request);
});

test("EMH screen-size preview keeps the same interactive Exp2 session", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const demoResponse = await page.request.get("/emh/demo");
  expect(demoResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(demoResponse.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self'",
  );
  const teacherResponse = await page.request.get("/teacher");
  expect(teacherResponse.headers()["x-frame-options"]).toBe("DENY");

  await page.goto("/emh/demo/preview");
  const demo = page.frameLocator('iframe[title="操作できるひとりデモ"]');
  const expectUnobstructedCountdown = async () => {
    await expect
      .poll(() =>
        demo.locator("body").evaluate(() => {
          const card = document
            .querySelector(".emh-countdown-card")!
            .getBoundingClientRect();
          const panel = document
            .querySelector(".emh-conditions")!
            .getBoundingClientRect();
          const arrow = document
            .querySelector(".study-conditions-arrow")!
            .getBoundingClientRect();
          const overlap = (a: DOMRect, b: DOMRect) =>
            a.left < b.right &&
            a.right > b.left &&
            a.top < b.bottom &&
            a.bottom > b.top;
          return (
            Math.abs((card.left + card.right - panel.left - panel.right) / 2) <
              1 &&
            Math.abs(panel.top - card.bottom - 40) < 1 &&
            arrow.top >= 0 &&
            arrow.bottom <= innerHeight &&
            !overlap(card, arrow) &&
            !overlap(card, panel)
          );
        }),
      )
      .toBe(true);
  };
  const experiment = demo.getByRole("combobox", { name: "実験", exact: true });
  await expect(experiment.getByRole("option")).toHaveText([
    "実験1（固定配当）",
    "実験2（抽選配当）",
  ]);
  await experiment.selectOption({ label: "実験2（抽選配当）" });
  await demo.getByRole("button", { name: "デモルームを作成" }).click();
  await demo.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await demo.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page.getByRole("button", { name: "一時停止", exact: true }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await page
    .getByRole("button", { name: "スマートフォン 390 × 844", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "390");
  await expect(page.locator("iframe")).toHaveAttribute("height", "724");
  await expect(
    page.getByRole("button", { name: "教員画面を見る" }),
  ).toBeVisible();
  await expect(
    demo.getByRole("group", { name: "状態別の配当、確率と期待配当" }),
  ).toBeVisible();
  await expect(demo.locator(".emh-conditions")).toHaveClass(
    /study-conditions-review/,
  );
  await expect(
    demo.locator(".emh-conditions .study-conditions-arrow"),
  ).toBeVisible();
  await expectUnobstructedCountdown();
  await expect(
    page.getByRole("button", { name: "再開", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "1366 × 768 表示倍率 100%", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveAttribute("width", "1366");
  await expect(
    page.getByRole("button", { name: "教員画面を見る" }),
  ).toBeVisible();
  await expect(
    demo.locator(".emh-conditions .study-conditions-arrow"),
  ).toBeVisible();
  await expectUnobstructedCountdown();
});

test("Double Auction preview retains its embedded demo and supports narrow-screen selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo/preview");
  const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
  await expect(frame.locator("body")).not.toBeEmpty();
  await page
    .getByRole("combobox", { name: "画面サイズ", exact: true })
    .selectOption("2");
  await expect(page.locator("iframe")).toHaveAttribute("width", "1280");
  await expect(frame.locator("body")).not.toBeEmpty();
});
