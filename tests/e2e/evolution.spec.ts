import { test, expect, type Page } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

async function fit(page: Page) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Page overflow at " + width,
    ).toBe(true);
    const overflow = await page
      .locator(
        "main button:visible, main .button:visible, .experiment-card h2:visible",
      )
      .evaluateAll((els) =>
        els
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      );
    expect(overflow, "Control overflow at " + width).toEqual([]);
  }
}
for (const mode of ["coordination", "demand"] as const)
  test(
    mode +
      " runs through admission, private decisions, settlement and teacher download",
    async ({ page, browser, baseURL }, info) => {
      await page.goto("/teacher");
      await enterTeacherPage(page);
      await fit(page);
      await page.getByRole("link", { name: /確率的進化ゲーム/ }).click();
      await page.getByLabel("表示言語").selectOption("en");
      await page
        .getByRole("combobox", { name: "Game", exact: true })
        .selectOption(mode);
      await page.getByLabel("Room title").fill("Review " + mode);
      await page
        .getByLabel("Rounds", { exact: true })
        .fill(mode === "demand" ? "2" : "1");
      await page.getByLabel("Decision time (s)").fill("90");
      await page.getByLabel("Feedback time (s)").fill("3");
      await page.getByLabel("Room password").fill("review-password");
      if (mode === "demand") {
        await page.getByLabel("Available amount").fill("0.3");
        await page.getByLabel("Demands (comma-separated)").fill("0.1, 1/10");
        await expect(
          page.getByRole("button", { name: "Create room" }),
        ).toBeDisabled();
        await page.getByLabel("Demands (comma-separated)").fill("0.1, 0.2");
      }
      await fit(page);
      await page.getByRole("button", { name: "Create room" }).click();
      await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher/);
      const code = new URL(page.url()).pathname.split("/").pop()!;
      await expect(
        page.getByRole("button", { name: "Close admission" }),
      ).toBeDisabled();
      const contexts = await Promise.all([
        browser.newContext({ baseURL }),
        browser.newContext({ baseURL }),
      ]);
      try {
        const players = await Promise.all(contexts.map((c) => c.newPage()));
        for (const [i, p] of players.entries()) {
          await p.goto("/?code=" + code);
          await p
            .getByLabel(/ニックネーム/)
            .first()
            .fill("Play" + i);
          await p.locator('input[name="pin"]').fill("4321");
          await p.getByRole("button", { name: "入室する" }).click();
          await expect(p).toHaveURL(/\/room\//);
          await p.getByLabel("表示言語").selectOption("en");
          await expect(p.getByText("Admission open").first()).toBeVisible();
        }
        await page.getByRole("button", { name: "Close admission" }).click();
        await expect(
          page.getByRole("heading", { name: "Ready to start" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Confirm and start" }).click();
        for (let n = 1; n <= (mode === "demand" ? 2 : 1); n++) {
          const [first, second] = players;
          await first.getByRole("radio").first().check();
          await first.getByRole("button", { name: "Submit choice" }).click();
          await expect(
            first.getByRole("heading", { name: "Submitted · waiting" }),
          ).toBeVisible();
          const privateView = await (
            await second.request.get(
              "/api/rooms/" + code + "/evolution?session=student",
            )
          ).json();
          expect(privateView.current.otherChoice).toBeNull();
          expect(privateView.current.choice).toBeNull();
          expect(privateView).not.toHaveProperty("seats");
          expect(
            (
              await second.request.get(
                "/api/rooms/" + code + "/evolution/export",
              )
            ).status(),
          ).toBe(401);
          await first.reload();
          await expect(
            first.getByRole("heading", { name: "Submitted · waiting" }),
          ).toBeVisible();
          if (n === 1) {
            await fit(first);
            await first.setViewportSize({ width: 390, height: 844 });
            if (mode === "coordination")
              expect(
                await first
                  .locator(".ev-rules .ev-scroll")
                  .evaluate((el) => el.scrollWidth <= el.clientWidth),
              ).toBe(true);
            await first.screenshot({
              path: info.outputPath(mode + "-student.png"),
              fullPage: true,
            });
          }
          await second.getByRole("radio").last().check();
          await second.getByRole("button", { name: "Submit choice" }).click();
          await expect(
            second.getByRole("heading", { name: "Settled", exact: true }),
          ).toBeVisible();
        }
        await expect(
          page.getByRole("heading", { name: "Finished" }),
        ).toBeVisible();
        await fit(page);
        await page.screenshot({
          path: info.outputPath(mode + "-teacher.png"),
          fullPage: true,
        });
        const dl = page.waitForEvent("download");
        await page.getByRole("link", { name: "Responses CSV" }).click();
        expect((await dl).suggestedFilename()).toContain("responses.csv");
        const data = await (
          await page.request.get("/api/rooms/" + code + "/evolution/export")
        ).json();
        expect(data.rows).toHaveLength(mode === "demand" ? 4 : 2);
        if (mode === "demand") {
          expect(data.rows.map((r: { pay: string }) => r.pay).sort()).toEqual([
            "1/10",
            "1/10",
            "1/5",
            "1/5",
          ]);
          expect(
            data.participants.map((p: { side: string }) => p.side).sort(),
          ).toEqual(["A", "B"]);
        }
        expect(
          data.rows.every((r: { status: string }) => r.status === "settled"),
        ).toBe(true);
      } finally {
        await Promise.all(contexts.map((c) => c.close()));
      }
    },
  );
test("demo switches roles, preserves the shared controls and keeps practice local", async ({
  page,
}) => {
  await page.goto("/evolution/demo");
  await enterTeacherPage(page);
  await expect(
    page.getByRole("link", { name: "DEMOモードを終了" }),
  ).toHaveAttribute("href", "/teacher?experiment=evolution");
  await page.getByLabel("表示言語").selectOption("zh-CN");
  await page.getByLabel("博弈模式").selectOption("demand");
  await page.getByLabel("演示人数").fill("3");
  await fit(page);
  await page.getByRole("button", { name: "创建演示" }).click();
  await page.getByRole("button", { name: "截止入室" }).click();
  await page.getByRole("button", { name: "确认并开始" }).click();
  let byes = 0;
  for (const id of ["1", "2", "3"]) {
    await page.getByLabel("演示视角").selectOption(id);
    if (await page.getByRole("heading", { name: "本轮轮空" }).count()) byes++;
    else {
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: "确认提交" }).click();
    }
  }
  expect(byes).toBe(1);
  await page.getByLabel("演示视角").selectOption("teacher");
  await fit(page);
  await expect(page.getByRole("heading", { name: "逐轮结果" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "创建演示" })).toBeVisible();
});
