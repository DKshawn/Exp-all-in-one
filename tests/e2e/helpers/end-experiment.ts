import { expect, type Page } from "@playwright/test";

export async function expectEndButton(page: Page, label = "実験を終了") {
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("background-color", "rgb(186, 64, 84)");
  await expect(button.locator("svg")).toHaveCount(0);
  return button;
}
