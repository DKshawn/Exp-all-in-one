import { test, expect } from "@playwright/test";
import { signInTeacher } from "./helpers/teacher-login";

test("room works without copied-array methods or language storage", async ({
  page,
  browser,
  baseURL,
}) => {
  function restrictFeatures(blockReads: boolean) {
    Reflect.deleteProperty(Array.prototype, "toReversed");
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    set.call(localStorage, "evolution-language", "ja");
    Storage.prototype.getItem = function (key) {
      if (key === "evolution-language" && blockReads)
        throw new DOMException("Unavailable", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "evolution-language")
        throw new DOMException("Unavailable", "QuotaExceededError");
      set.call(this, key, value);
    };
  }
  await signInTeacher(page.request);
  await page.addInitScript(restrictFeatures, false);
  await page.goto("/teacher?experiment=evolution");
  const language = page.getByRole("banner").getByRole("combobox");
  await language.selectOption("en");
  await expect(language).toHaveValue("en");
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addStyleTag({
    content: ".ev-payoff-pair input {field-sizing:fixed !important}",
  });
  const matrix = page.getByRole("table", { name: "Payoff matrix" });
  await expect
    .poll(() =>
      matrix.evaluate(
        (t) => t.parentElement!.scrollWidth - t.parentElement!.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  const field = matrix.getByRole("textbox").first();
  await field.fill("-123456789/123456789");
  await expect(field).toHaveValue("-123456789/123456789");
  await page.getByLabel("Room password").fill("audit-room-password");
  await page.getByLabel("Decision time (s)").fill("90");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  const contexts = await Promise.all([
    browser.newContext({ baseURL }),
    browser.newContext({ baseURL }),
  ]);
  try {
    const players = await Promise.all(
      contexts.map(async (context, i) => {
        await context.addInitScript(restrictFeatures, true);
        const p = await context.newPage();
        await p.goto("/?code=" + code);
        await p.locator('input[name="nickname"]').fill("Test" + i);
        await p.locator('input[name="pin"]').fill("1234");
        await p.getByRole("button", { name: "入室する" }).click();
        await expect(p).toHaveURL(/\/room\//);
        await p.getByRole("banner").getByRole("combobox").selectOption("en");
        return p;
      }),
    );
    await page
      .getByRole("button", { name: "Close admission", exact: true })
      .click();
    await page.getByRole("button", { name: "Confirm and start" }).click();
    await expect(page.locator(".ev-analysis")).toBeVisible();
    for (const p of players) {
      await p.getByRole("radio").last().check();
      await p.getByRole("button", { name: "Submit choice" }).click();
    }
    for (const p of players)
      await expect(p.getByRole("table", { name: "My rounds" })).toContainText(
        "Settled",
      );
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
