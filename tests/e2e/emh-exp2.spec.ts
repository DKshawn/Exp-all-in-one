import { expect, test, type BrowserContext } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

test("Exp2 creation and participant view use the default two securities and a single period per round", async ({
  page,
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  let code: string | undefined;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/teacher?experiment=emh");
    await enterTeacherPage(page);
    await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
    await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
    await page
      .getByLabel("教員パスワード", { exact: false })
      .fill("Exp2-Verification-Password");
    await page
      .getByRole("button", { name: "ルームを作成", exact: true })
      .click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+\?entry=teacher/);
    code = new URL(page.url()).pathname.split("/")[2];
    const student = await browser.newContext({ baseURL });
    contexts.push(student);
    const studentPage = await student.newPage();
    studentPage.on("pageerror", (error) => errors.push(error.message));
    await studentPage.goto(`/?code=${code}`);
    await studentPage.locator('[name="nickname"]').fill("確認参加者");
    await studentPage.locator('[name="pin"]').fill("1234");
    await studentPage
      .getByRole("button", { name: "入室する", exact: true })
      .click();
    for (let i = 1; i < 12; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect(
        (
          await context.request.post(`/api/rooms/${code}/join`, {
            data: { nickname: `参加者${i}`, pin: "1234" },
          })
        ).ok(),
      ).toBe(true);
    }
    const assign = page.getByRole("button", {
      name: "分け方を確定して受付終了",
      exact: true,
    });
    await expect(assign).toBeEnabled();
    await expect(page.locator(".emh-allocation")).toContainText("4 / 4 / 4");
    await assign.click();
    await page
      .getByRole("button", { name: "全市場で実験を開始", exact: true })
      .click();
    await expect(studentPage.getByText("Clue カード")).toBeVisible();
    await expect(studentPage.getByText("情報なし")).toBeVisible();
    await expect(
      studentPage.getByRole("group", { name: "状態別の配当、確率と期待配当" }),
    ).toBeVisible();
    await expect(studentPage.locator(".exp2-state-realized")).toHaveCount(0);
    await expect(studentPage.locator(".emh-personal-account")).toContainText(
      /保有証券\s*2\s*単位/,
    );
    await expect(
      studentPage.getByRole("heading", { name: "配当・損益の記録" }),
    ).toBeVisible();
    await expect(studentPage.getByText("B期配当 / 単位")).toHaveCount(0);
    for (const width of [1440, 768, 390, 320]) {
      await studentPage.setViewportSize({ width, height: 1080 });
      if (width === 1440 || width === 390)
        await studentPage.screenshot({
          path: info.outputPath(`exp2-${width}.png`),
          fullPage: true,
        });
      expect(
        await studentPage.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await studentPage.setViewportSize({ width: 390, height: 568 });
    await expect(studentPage.getByLabel("買値（円）")).toBeEnabled({
      timeout: 12000,
    });
    await studentPage.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "期を終了", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "配当を確定して進む" })
      .click();
    const realized = studentPage.locator(
      ".exp2-state-values > .exp2-state-realized",
    );
    await expect(realized).toHaveCount(1);
    await expect(realized).toContainText("実現");
    await expect(realized).toHaveCSS("animation-name", "emh-state-reveal");
    await expect
      .poll(() =>
        realized.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        }),
      )
      .toBe(true);
    await studentPage.screenshot({
      path: info.outputPath("exp2-state-reveal.png"),
    });
    const resultState = await studentPage
      .locator(".results-panel tbody .period-chip")
      .first()
      .textContent();
    await expect(realized).toContainText(`状態 ${resultState}`);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    if (code) {
      const deleted = await page.request.delete(
        `/api/rooms/${code}?session=teacher`,
        { data: { confirmed: true } },
      );
      expect(deleted.ok()).toBe(true);
    }
  }
});
