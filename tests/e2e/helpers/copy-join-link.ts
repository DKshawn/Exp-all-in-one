import { expect, type Page } from "@playwright/test";

export async function expectCopiedJoinLink(
  page: Page,
  studentPath: string,
  buttonName = "参加リンクをコピー",
  copiedName = "コピーしました",
) {
  const teacherUrl = page.url();
  const context = page.context();
  const tabs = context.pages().length;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(teacherUrl).origin,
  });
  await page.bringToFront();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  await expect(
    page.getByRole("button", { name: copiedName, exact: true }),
  ).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(new URL(studentPath, teacherUrl).href);
  await expect(page).toHaveURL(teacherUrl);
  expect(context.pages()).toHaveLength(tabs);
  return copied;
}
