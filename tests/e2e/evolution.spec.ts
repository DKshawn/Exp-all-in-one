import { test, expect, type Page } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";
import { expectEndButton } from "./helpers/end-experiment";

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
        "main button:visible, main .button:visible, .ev-demo-bar button:visible, header .button:visible, .experiment-card h2:visible",
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
      await page
        .getByRole("link", { name: /Stochastic Evolutionary Games/ })
        .click();
      await page.getByRole("banner").getByLabel("表示言語").selectOption("en");
      await expect(page.locator("form").getByLabel("Language")).toHaveCount(0);
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
          const language = p.getByRole("banner").getByLabel("表示言語");
          await expect(language).toHaveValue("ja");
          await language.selectOption("en");
          await expect(p.getByText("Admission open").first()).toBeVisible();
          await p.getByRole("button", { name: "Rules", exact: true }).click();
          const rules = p.getByRole("dialog", { name: "Rules" });
          await expect(
            rules.getByRole("heading", {
              name:
                mode === "demand" ? "Nash demand game" : "Coordination game",
            }),
          ).toBeVisible();
          await rules
            .getByRole("button", { name: "Close", exact: true })
            .click();
        }
        await page.getByRole("button", { name: "Close admission" }).click();
        await expect(
          page.getByRole("heading", { name: "Ready to start" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Confirm and start" }).click();
        await expectEndButton(page, "End experiment");
        await expect(players[0].getByRole("radio").first()).toBeVisible();
        await expect(
          players[0].getByRole("button", { name: "Pause", exact: true }),
        ).toHaveCount(0);
        if (mode === "coordination") {
          await page
            .getByRole("button", { name: "Pause", exact: true })
            .click();
          await expect(
            players[0].getByRole("heading", { name: "Paused" }),
          ).toBeVisible();
          await expect(players[0].getByRole("radio").first()).toBeDisabled();
          await page.reload();
          await page
            .getByRole("button", { name: "Resume", exact: true })
            .click();
          await page.getByRole("button", { name: "Advance 30 s" }).click();
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "Advance 30 s" })
            .click();
          await expect(page.getByRole("timer")).toHaveText(
            /^(?:01:00|00:[0-5][0-9])$/,
          );
        }
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

for (const mode of ["coordination", "demand"] as const)
  test(
    mode +
      " demo has automatic opponents, shared admission and a compact history",
    async ({ page }, info) => {
      await page.goto("/evolution/demo");
      await enterTeacherPage(page);
      await page.clock.install();
      const header = page.getByRole("banner");
      await header.getByLabel("表示言語").selectOption("zh-CN");
      const bar = page.getByRole("region", { name: "演示工具栏" });
      const student = bar.getByRole("button", { name: "查看学生页面" });
      const teacher = bar.getByRole("button", { name: "查看教师页面" });
      const pause = bar.getByRole("button", { name: "暂停", exact: true });
      const resume = bar.getByRole("button", { name: "继续", exact: true });
      const fast = bar.getByRole("button", { name: "快进 30 秒" });
      const form = page.locator("form.ev-setup");
      await expect(form.getByLabel("显示语言")).toHaveCount(0);
      await expect(bar).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "查看学生页面" }),
      ).toHaveCount(0);
      await page.getByLabel("博弈模式").selectOption(mode);
      await page.getByLabel("演示人数").fill("8");
      await page.getByLabel("作答时限（秒）").fill("15");
      await page.getByLabel("反馈时间（秒）").fill("8");
      await page.getByLabel("轮数", { exact: true }).fill("25");
      await page.getByLabel("实验名称").fill("Review " + mode);
      await header.getByLabel("显示语言").selectOption("en");
      await expect(
        form.getByRole("combobox", { name: "Game", exact: true }),
      ).toHaveValue(mode);
      await expect(form.getByLabel("Demo participants")).toHaveValue("8");
      await expect(form.getByLabel("Room title")).toHaveValue("Review " + mode);
      await header.getByLabel("Language").selectOption("zh-CN");
      await fit(page);
      await header.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(mode + "-setup.png") });
      await page.getByRole("button", { name: "创建演示" }).click();
      await expect(page.locator("main.ev-room > details")).toHaveCount(0);
      if (mode === "coordination")
        await page.screenshot({ path: info.outputPath("teacher-lobby.png") });
      await student.click();
      await expect(page.locator(".student-waiting-card")).toBeVisible();
      await expect(page.locator("main.ev-room > details")).toHaveCount(0);
      if (mode === "coordination")
        await page.screenshot({ path: info.outputPath("student-lobby.png") });
      await expect(
        page.getByRole("heading", { name: "Review " + mode }),
      ).toBeVisible();
      await teacher.click();
      await expect(pause).toBeDisabled();
      await expect(fast).toBeDisabled();
      await expect(page.getByText(/模拟参与者\s*7/)).toBeVisible();
      await page.getByLabel("独立群体数").selectOption("2");
      await page.getByRole("button", { name: "启动截止计时" }).click();
      await page.getByRole("button", { name: "暂停截止计时" }).click();
      await page.getByRole("button", { name: "继续截止计时" }).click();
      await page.getByRole("button", { name: "重置截止计时" }).click();
      await page.getByRole("button", { name: "截止入室", exact: true }).click();
      await expect(page.locator(".ev-roster-seats span")).toHaveCount(8);
      await page.getByRole("button", { name: "重新开放入室" }).click();
      await page.getByRole("button", { name: "截止入室", exact: true }).click();
      await student.click();
      await expect(page.locator(".student-waiting-card")).toBeVisible();
      await teacher.click();
      await page.getByRole("button", { name: "确认并开始" }).click();
      await expect(
        page.getByRole("button", { name: "暂停", exact: true }),
      ).toHaveCount(1);
      await pause.click();
      const time = await page.getByRole("timer").innerText();
      await student.click();
      const resumeColor = await resume.evaluate(
        (button) => getComputedStyle(button).backgroundColor,
      );
      await expect(
        page.locator('.round-strip [aria-current="step"] > span'),
      ).toHaveCSS("background-color", resumeColor);
      await page.clock.fastForward(60_000);
      await expect(page.getByRole("timer")).toHaveText(time);
      await expect(page.getByRole("radio").first()).toBeDisabled();
      await expect(fast).toBeDisabled();
      await resume.click();
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: "确认提交" }).click();
      await expect(
        page.getByRole("heading", { name: "轮间反馈" }),
      ).toBeVisible();
      await pause.click();
      await expect(page.getByRole("heading", { name: "已结算" })).toBeVisible();
      await expect(page.locator(".ev-payoffs dd").nth(1)).not.toHaveText("—");
      const payoffs = await page.locator(".ev-payoffs dd").allTextContents();
      const feedbackTime = await page.getByRole("timer").innerText();
      await teacher.click();
      await expect(resume).toBeEnabled();
      await expect(fast).toBeDisabled();
      await student.click();
      await page.clock.fastForward(120_000);
      await expect(page.locator(".round-step.active")).toHaveText("1");
      await expect(page.getByRole("timer")).toHaveText(feedbackTime);
      await expect(page.locator(".ev-payoffs dd")).toHaveText(payoffs);
      await page.screenshot({
        path: info.outputPath(mode + "-paused-feedback.png"),
      });
      await resume.click();
      await page.clock.fastForward(9_000);
      await expect(page.locator(".round-step.active")).toHaveText("2");
      for (let i = 0; i < 10; i++)
        await page.getByRole("button", { name: "快进 30 秒" }).click();
      await fit(page);
      await page.setViewportSize({ width: 320, height: 640 });
      const history = page.getByRole("region", { name: "个人记录" });
      expect(await history.locator("tbody tr").count()).toBeGreaterThan(10);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await history.evaluate(
          (el) =>
            el.scrollHeight > el.clientHeight &&
            el.getBoundingClientRect().top + 65 < innerHeight,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await history.evaluate(
          (el) => el.getBoundingClientRect().top + 65 < innerHeight,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(mode + "-mobile-history.png"),
      });
      await page.getByRole("button", { name: "查看教师页面" }).click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: info.outputPath(mode + "-toolbar.png") });
      await (await expectEndButton(page, "结束实验")).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "结束实验" })
        .click();
      await expect(
        page.getByRole("heading", { name: "实验结束" }),
      ).toBeVisible();
      await expect(pause).toBeDisabled();
      await expect(fast).toBeDisabled();
      await bar.getByRole("button", { name: "返回配置" }).click();
      await expect(form.getByLabel("博弈模式")).toHaveValue(mode);
      await expect(bar).toHaveCount(0);
    },
  );
