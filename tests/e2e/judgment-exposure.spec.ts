import { test, expect } from "@playwright/test";
import { signInTeacher } from "./helpers/teacher-login";

test("static questions account for active time and exclude the withdrawal dialog", async ({
  page,
  browser,
  baseURL,
}) => {
  await signInTeacher(page.request);
  await page.goto("/teacher?experiment=judgment");
  await page.locator('input[aria-describedby$="03-02-description"]').check();
  await page
    .getByLabel("実験名", { exact: true })
    .fill("Exposure verification");
  await page
    .getByLabel("教員パスワード", { exact: false })
    .fill("exposure-password");
  await page.getByRole("button", { name: "ルームを作成", exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  const context = await browser.newContext({ baseURL });
  try {
    await expect(
      await context.request.post("/api/rooms/" + code + "/join", {
        data: { nickname: "0012345", pin: "1234" },
      }),
    ).toBeOK();
    await page.getByRole("button", { name: "実施を開始", exact: true }).click();
    const student = await context.newPage();
    await student.clock.install();
    await student.goto("/room/" + code);
    await expect(student.locator("#answer-form")).toBeVisible();
    await student.clock.fastForward(1000);
    await student.locator("#withdraw").click();
    await student.clock.fastForward(5000);
    await student.locator("#keep-going").click();
    await expect(student.locator("#withdraw-dialog")).not.toBeVisible();
    await student.clock.runFor(30);
    await student.clock.fastForward(1000);
    await student.locator('#answer-form input[type="number"]').fill("72");
    const saved = student.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname.endsWith("/answers"),
    );
    await student.locator("#next").click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const { metrics } = response.request().postDataJSON();
    expect(metrics.activeMs).toBeGreaterThanOrEqual(2000);
    expect(metrics.rtMs - metrics.activeMs).toBeGreaterThanOrEqual(4900);
    expect(metrics.rtMs - metrics.activeMs).toBeLessThan(6000);
  } finally {
    await context.close();
  }
});
