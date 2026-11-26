import { test, expect } from "@playwright/test";
import { enterTeacherPage, signInTeacher } from "./helpers/teacher-login";

test("memo v3 demo separates settings and student feedback from the classic game", async ({
  page,
}) => {
  await page.goto("/evolution/demo");
  await enterTeacherPage(page);
  await page.clock.install();
  await page.getByRole("banner").getByRole("combobox").selectOption("en");
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  await expect(mode).toHaveValue("coordination");
  await expect(
    page.getByRole("table", { name: "Payoff matrix" }),
  ).toBeVisible();
  await mode.selectOption("memo");
  await expect(page.getByText(/120 rounds × 3/)).toBeVisible();
  await expect(page.getByLabel("Decision time (s)")).toHaveCount(0);
  await page.getByLabel("Block order").selectOption("large-first");
  await page.getByLabel("Starting condition allocation").selectOption("hare");
  await page.getByRole("button", { name: "Create demo" }).click();
  await page.getByRole("button", { name: "Close admission" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await page.getByRole("button", { name: "View student screen" }).click();
  await expect(page.getByText(/Block 1\/3.*Round 1\/120/)).toBeVisible();
  await expect(page.getByText("Fixed starting choice: Hare")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stag", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("No previous result in this block yet."),
  ).toBeVisible();
  await page.clock.fastForward(6200);
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Round 1: 100%/ })).toBeVisible();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("memo v3 formal setup can return to classic and requires the full cohort on admission", async ({
  page,
}) => {
  await signInTeacher(page.request);
  await page.goto("/teacher?experiment=evolution");
  await page.getByRole("banner").getByRole("combobox").selectOption("en");
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  await mode.selectOption("memo");
  await mode.selectOption("coordination");
  await expect(
    page.getByRole("table", { name: "Payoff matrix" }),
  ).toBeVisible();
  await expect(page.getByLabel("Feedback time (s)")).toHaveValue("8");
  await mode.selectOption("memo");
  await page.getByLabel("Room title").fill("Synthetic Memo v3");
  await page.getByLabel("Room password").fill("review-password");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher/);
  await expect(
    page.getByRole("button", { name: "Close admission" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Close admission when 150 participants have joined."),
  ).toBeVisible();
  await expect(page.getByLabel("Independent groups")).toHaveCount(0);
});
