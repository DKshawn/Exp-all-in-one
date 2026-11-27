import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { enterTeacherPage, signInTeacher } from "./helpers/teacher-login";
import { memoDefaults } from "../../src/experiments/evolution/settings";

const labels = {
  en: {
    stag: "Stag",
    hare: "Hare",
    payoff: "Points against one opponent",
    share: "Group hare share",
    prior: "Previous round",
    choice: "My choice",
    round: "Round",
  },
  ja: {
    stag: "鹿",
    hare: "兎",
    payoff: "相手1人あたりの点数",
    share: "グループ内の兎の割合",
    prior: "前回の結果",
    choice: "自分の選択",
    round: "ラウンド",
  },
  "zh-CN": {
    stag: "鹿",
    hare: "兔",
    payoff: "对单个对手的得分",
    share: "组选兔比例",
    prior: "上轮结果",
    choice: "我的选择",
    round: "轮次",
  },
} as const;

async function checkStudentViewport(
  page: Page,
  testInfo: TestInfo,
  entry: string,
) {
  const metrics = [];
  const language = page.getByRole("banner").getByRole("combobox");
  for (const lang of ["ja", "zh-CN", "en"] as const) {
    await language.selectOption(lang);
    const names = labels[lang];
    const payoff = page.getByRole("table", { name: names.payoff });
    const share = page.getByRole("progressbar", { name: names.share });
    const stag = page.getByRole("button", { name: names.stag, exact: true });
    const hare = page.getByRole("button", { name: names.hare, exact: true });
    const headings = page.locator(".ev-memo-student .ev-panel h2");
    await expect(headings).toContainText([names.choice, names.prior]);
    await expect(payoff.locator("td")).toHaveText(["4", "0", "3", "3"]);
    await expect(share).toBeVisible();
    await expect(page.locator(".ev-memo-chart-scale span")).toHaveText([
      "100%",
      "50%",
      "0%",
    ]);
    await expect(page.locator(".ev-memo-chart-round-label")).toHaveText(
      names.round,
    );

    for (const width of [320, 390, 1440]) {
      const height = width === 1440 ? 900 : 740;
      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollTo(0, 0));
      const bounds = await Promise.all(
        [stag, hare, payoff, share].map(async (locator) => {
          await expect(
            locator,
            `${entry} ${lang} ${width}×${height}`,
          ).toBeInViewport({ ratio: 1 });
          return (await locator.boundingBox())!;
        }),
      );
      const bottoms = bounds.map(({ y, height }) => Math.ceil(y + height));
      expect(bottoms[0]).toBeLessThan(bounds[2].y);
      expect(bottoms[2]).toBeLessThan(bounds[3].y);
      expect(Math.max(...bottoms)).toBeLessThanOrEqual(height);
      const choices = (await page.locator(".ev-memo-choice").boundingBox())!;
      const feedback = (await page.locator(".ev-memo-feedback").boundingBox())!;
      const account = (await page
        .locator(".ev-memo-student > .ev-account")
        .boundingBox())!;
      const accountGap = account.y - (feedback.y + feedback.height);
      expect(accountGap).toBeCloseTo(
        feedback.y - (choices.y + choices.height),
        1,
      );
      const frame = page.locator(".ev-memo-options");
      const lock = page.locator(".ev-memo-choice-lock");
      const frameBox = (await frame.boundingBox())!;
      const lockBox = (await lock.boundingBox())!;
      expect(lockBox.width).toBe(24);
      expect(lockBox.x + lockBox.width / 2).toBeCloseTo(
        frameBox.x + frameBox.width / 2,
      );
      expect(lockBox.y + lockBox.height / 2).toBeCloseTo(
        frameBox.y + frameBox.height / 2,
      );
      expect(bounds[0].x + bounds[0].width).toBeLessThan(lockBox.x);
      expect(lockBox.x + lockBox.width).toBeLessThan(bounds[1].x);
      await expect(frame).not.toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
      const chartWidth = (await page.locator(".ev-memo-chart").boundingBox())!
        .width;
      const plotWidth = (await page
        .locator(".ev-memo-chart-plot")
        .boundingBox())!.width;
      const figureWidth = (await page
        .locator(".ev-memo-feedback figure")
        .boundingBox())!.width;
      expect(chartWidth).toBe(figureWidth);
      expect(plotWidth).toBeGreaterThan(figureWidth * 0.8);
      if (entry === "demo") {
        const toolbar = page.locator(".ev-demo-bar");
        await expect(toolbar).toBeInViewport({ ratio: 1 });
        const bar = (await toolbar.boundingBox())!;
        const heading = (await page
          .getByRole("main")
          .getByRole("heading", { level: 1 })
          .boundingBox())!;
        expect(bar.y + bar.height).toBeLessThan(heading.y);
        const rows = new Set();
        for (const control of await toolbar.getByRole("button").all()) {
          await expect(control).toBeInViewport({ ratio: 1 });
          rows.add(Math.round((await control.boundingBox())!.y));
        }
        expect(rows.size).toBe(1);
      }
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth > innerWidth,
        labels: Array.from(
          document.querySelectorAll(
            ".ev-memo-student h2, .ev-memo-student th, .ev-memo-student caption, .ev-memo-student button, .ev-memo-proportion span, .ev-demo-bar button",
          ),
        )
          .filter((el) => el.scrollWidth > el.clientWidth + 1)
          .map((el) => el.textContent),
      }));
      expect(overflow).toEqual({ page: false, labels: [] });
      metrics.push({
        lang,
        width,
        height,
        choices: Math.max(...bottoms.slice(0, 2)),
        payoff: bottoms[2],
        share: bottoms[3],
        accountGap,
      });
      if (lang === "en")
        await page.screenshot({
          path: testInfo.outputPath(`${entry}-${width}.png`),
          animations: "disabled",
        });
    }
  }
  await testInfo.attach("first-fold", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  console.log(entry, JSON.stringify(metrics));
}

async function studentLayout(page: Page) {
  const sizes = [];
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    sizes.push(
      await page.locator(".ev-memo-student").evaluate((main) =>
        [
          ...main.querySelectorAll(
            ".ev-memo-choice, .ev-memo-feedback, .ev-memo-chart, .ev-account",
          ),
        ].map((panel) => {
          const { y, height } = panel.getBoundingClientRect();
          return [Math.round(y + scrollY), Math.round(height)];
        }),
      ),
    );
  }
  return sizes;
}

async function expectTeacherStats(page: Page, round: number, counts: string[]) {
  const results = page.getByRole("table", { name: "Round results" });
  await expect(results.getByRole("columnheader")).toHaveText([
    "Round",
    "Eligible",
    "Submitted",
    "Timeouts",
    "Settled players",
    "Choice shares",
    "Total payoff",
  ]);
  const row = results.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: String(round), exact: true }),
  });
  await expect(
    row.getByRole("cell").and(row.locator("td:nth-child(-n+5)")),
  ).toHaveText(counts);
  return row;
}

async function checkTeacherViewport(page: Page) {
  const region = page.getByRole("region", { name: "Round results" });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 740 });
    await expect(region).toBeVisible();
    const fits = await region.evaluate(
      (table) =>
        document.documentElement.scrollWidth === innerWidth &&
        table.getBoundingClientRect().right <= innerWidth &&
        Array.from(table.querySelectorAll("th")).every(
          (header) => header.scrollWidth <= header.clientWidth + 1,
        ),
    );
    expect(fits, `Teacher results at ${width}px`).toBe(true);
  }
}

test("memo v3 demo shows the payoff table, fixed start, and one-click revision", async ({
  page,
}, testInfo) => {
  // A swap index of 1 leaves the human (first seat) at index 0.
  await page.addInitScript(() => {
    const original = Crypto.prototype.getRandomValues;
    Crypto.prototype.getRandomValues = function <
      T extends Parameters<typeof original>[0],
    >(this: Crypto, array: T): T {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = document.body?.dataset.demoDraw === "0" ? 0 : 1;
        return array;
      }
      return original.call(this, array) as T;
    };
  });
  await page.goto("/evolution/demo");
  await enterTeacherPage(page);
  await page.clock.install();
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  const language = page.getByRole("banner").getByRole("combobox");
  await expect(async () => {
    await language.selectOption("en");
    await expect(mode).toHaveValue("coordination", { timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await expect(
    page.getByRole("table", { name: "Payoff matrix" }),
  ).toBeVisible();
  await mode.selectOption("memo");
  await expect(page.getByText(/120 rounds × 3/)).toBeVisible();
  await expect(page.getByLabel("Decision time (s)")).toHaveValue("5");
  await expect(
    page.getByText("Only those selected can change their choice"),
  ).toBeVisible();
  await language.selectOption("ja");
  await expect(page.getByText("参加者の中から20%")).toBeVisible();
  await language.selectOption("en");
  await expect(
    page.getByText("Your score for the round is the average of those points."),
  ).toBeVisible();
  await page.getByLabel("Block order").selectOption("large-first");
  await page.getByLabel("Starting condition allocation").selectOption("hare");
  await page.getByRole("button", { name: "Create demo" }).click();
  await page.getByRole("button", { name: "View student screen" }).click();
  await expect(
    page.getByRole("button", { name: "Rules", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View teacher screen" }).click();
  await page.getByRole("button", { name: "Close admission" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await page.getByRole("button", { name: "View student screen" }).click();
  await expect(page.getByText(/Block 1\/3.*Round 1\/120/)).toBeVisible();
  const choice = page.locator(".ev-memo-choice");
  const lock = choice.locator(".ev-memo-choice-lock");
  const stag = choice.getByRole("button", { name: "Stag", exact: true });
  const hare = choice.getByRole("button", { name: "Hare", exact: true });
  await expect(choice.getByRole("status")).toHaveText(
    "Your whole group plays Hare in rounds 1–10.",
  );
  await expect(lock).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rules", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "This round’s revision" }),
  ).toHaveCount(0);
  const mutedBorder = await stag.evaluate(
    (element) => getComputedStyle(element).borderTopColor,
  );
  const mutedColor = await stag.evaluate(
    (element) => getComputedStyle(element).color,
  );
  await expect(hare).toHaveCSS("color", mutedColor);
  const emptyPlotWidth = (await page
    .locator(".ev-memo-chart-plot")
    .boundingBox())!.width;
  expect(emptyPlotWidth).toBeGreaterThan(500);
  await expect(page.getByText("Decisions open", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Stag", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Hare", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("No previous result in this block yet."),
  ).toBeVisible();
  const progressArea = page.locator(".ev-memo-overview");
  const payoff = progressArea.locator(".ev-memo-round-payoff");
  await expect(payoff).toBeEmpty();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  for (let step = 0; step < 22 && !(await payoff.locator("b").count()); step++)
    await page.clock.runFor(250);

  const originalViewport = page.viewportSize()!;
  for (const [lang, payoffLabel] of [
    ["ja", "今回の得点"],
    ["zh-CN", "本轮收益"],
    ["en", "Payoff"],
  ] as const) {
    await language.selectOption(lang);
    await expect(payoff).toHaveText(payoffLabel + "3");
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      const phase = (await progressArea
        .getByRole("heading", { level: 2 })
        .boundingBox())!;
      const hint = (await payoff.boundingBox())!;
      const timer = (await progressArea.locator(".timers").boundingBox())!;
      expect(phase.x + phase.width).toBeLessThan(hint.x);
      expect(hint.x + hint.width).toBeLessThan(timer.x);
    }
  }
  await page.setViewportSize(originalViewport);
  await page.clock.runFor(1000);
  await expect(payoff).toBeEmpty();
  await page.clock.resume();
  const firstResult = page.getByRole("img", {
    name: "Round 1: 100%",
    exact: true,
  });
  await expect(firstResult.locator("circle")).toHaveAttribute("cx", "50%");
  expect(
    (await firstResult.locator(".ev-memo-chart-plot").boundingBox())!.width,
  ).toBe(emptyPlotWidth);
  const initialLayout = await studentLayout(page);
  await page.clock.fastForward(24000);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".ev-memo-proportion strong")).toHaveText("100%");
  expect(await studentLayout(page)).toEqual(initialLayout);
  await expect(page.getByRole("img", { name: /Round 5: 100%/ })).toBeVisible();
  await expect(page.locator(".ev-memo-payoffs")).toContainText("My payoff3");
  await checkStudentViewport(page, testInfo, "demo");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Advance 30 s" }).click();
  await expect(page.getByText(/Round 11\/120/)).toBeVisible();
  await expect(choice.getByRole("status")).toHaveText(
    "You can revise your choice this round.",
  );
  await expect(stag).toBeEnabled();
  await expect(stag).not.toHaveCSS("border-top-color", mutedBorder);
  await expect(stag).not.toHaveCSS("color", mutedColor);
  await expect(hare).not.toHaveCSS("color", mutedColor);
  await expect(lock).toHaveCount(0);
  await expect(choice.locator(".ev-memo-options")).toHaveCSS(
    "border-top-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(await studentLayout(page)).toEqual(initialLayout);
  await choice.screenshot({
    path: testInfo.outputPath("demo-eligible-390.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Hare", exact: true }).click();
  await expect(choice.getByRole("status")).toHaveText("Choice received.");
  await expect(lock).toBeVisible();
  expect(await studentLayout(page)).toEqual(initialLayout);
  await expect(
    page.getByRole("button", { name: "Stag", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    document.body.dataset.demoDraw = "0";
  });
  await page.clock.fastForward(6000);
  await expect(page.getByText(/Round 12\/120/)).toBeVisible();
  await expect(
    choice.getByText("Not selected. Previous choice carries over."),
  ).toBeVisible();
  expect(await studentLayout(page)).toEqual(initialLayout);
  await expect(
    page.getByRole("button", { name: "Hare", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "View teacher screen" }).click();
  await expect(page.getByText("Pair outcomes", { exact: true })).toHaveCount(0);
  const row = await expectTeacherStats(page, 11, [
    "30/150",
    "30",
    "0",
    "150/150",
  ]);
  await expect(row.getByRole("meter")).toHaveCount(2);
  await expectTeacherStats(page, 1, ["0/150", "0", "0", "150/150"]);

  await page.getByRole("button", { name: "View student screen" }).click();
  await page.clock.fastForward((121 - 12) * 6000);
  await expect(page.getByText(/Block 2\/3.*Round 1\/120/)).toBeVisible();
  await expect(page.getByText("This is a new group.")).toBeVisible();
  await expect(
    page.getByText("No previous result in this block yet."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /Round \d+: / })).toHaveCount(0);
  expect(await studentLayout(page)).toEqual(initialLayout);
  await page.clock.fastForward(25 * 6000);
  await expect(page.getByText(/Block 2\/3.*Round 26\/120/)).toBeVisible();
  const trend = page.getByRole("img", { name: /Round 6: .*Round 25: / });
  await expect(trend.locator("circle")).toHaveCount(20);
  await expect(trend.locator(".ev-memo-chart-rounds span")).toHaveText([
    "6",
    "11",
    "16",
    "20",
    "25",
  ]);
  await expect(trend.locator("circle").first()).toHaveAttribute("cx", "0%");
  await expect(trend.locator("circle").last()).toHaveAttribute("cx", "100%");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator(".ev-memo-feedback").screenshot({
    path: testInfo.outputPath("demo-round-chart-320.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "View teacher screen" }).click();
  await page
    .getByRole("combobox", { name: "Group", exact: true })
    .selectOption("5");
  await expect(
    page.getByRole("table", { name: "Round results" }).getByRole("row"),
  ).toHaveCount(22);
  await checkTeacherViewport(page);
});

test("memo v3 demo validates free-form durations and restores the locked setting", async ({
  page,
}) => {
  await signInTeacher(page.request);
  await page.goto("/evolution/demo");
  const language = page.getByRole("banner").getByRole("combobox");
  await language.selectOption("en");
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  await mode.selectOption("memo");
  const duration = page.getByRole("spinbutton", { name: "Decision time (s)" });
  const alert = page.locator(".ev-setup").getByRole("alert");
  const create = page.getByRole("button", { name: "Create demo" });
  await expect(duration).toHaveValue("5");
  for (const [value, error] of [
    ["", "Enter a decision time."],
    ["0", "Decision time must be greater than zero."],
    ["-1.5", "Decision time must be greater than zero."],
    ["1.500000000000000001", /cannot be timed exactly/],
    ["1e20", /cannot be timed exactly/],
  ] as const) {
    await duration.fill(value);
    await create.click();
    await expect(duration).toBeFocused();
    await expect(duration).toHaveAttribute("aria-invalid", "true");
    await expect(alert).toHaveText(error);
  }
  await duration.fill("");
  await duration.press("e");
  await create.click();
  await expect(alert).toHaveText(
    "Enter the decision time as a number of seconds.",
  );
  await duration.fill("7");
  await page.getByLabel("Block order").selectOption("large-first");
  await page.getByLabel("Starting condition allocation").selectOption("hare");
  await expect(duration).toHaveValue("7");
  for (const [lang, name] of [
    ["ja", "回答時間（秒）"],
    ["zh-CN", "作答时间（秒）"],
    ["en", "Decision time (s)"],
  ] as const) {
    await language.selectOption(lang);
    const field = page.getByRole("spinbutton", { name });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      expect(
        await field.evaluate((input) => {
          const label = (input as HTMLInputElement).labels![0];
          return (
            label.scrollWidth <= label.clientWidth &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      ).toBe(true);
    }
  }
  await create.click();
  await expect(
    page.getByText("Decision time (s) 7", { exact: true }),
  ).toBeVisible();
  await expect(duration).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Decision time (s) 7", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to setup" }).click();
  await expect(duration).toHaveValue("7");
  await duration.fill("1.5");
  await page.clock.install();
  await create.click();
  await expect(
    page.getByText("Decision time (s) 1.5", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close admission" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await expect(page.locator(".timers progress")).toHaveAttribute("max", "1.5");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /JSON/ }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const output = JSON.parse(Buffer.concat(chunks).toString());
  expect(output.settings.memoAnswerSeconds).toBe("1.5");
  expect(output.settings.feedbackSeconds).toBe(1);
  expect(output.rows[0].deadline - output.rows[0].openedAt).toBe(1500);
});

test("memo v3 formal teacher and student use normal entries with a 150-seat synthetic roster", async ({
  page,
  browser,
  baseURL,
  playwright,
}, testInfo) => {
  await signInTeacher(page.request);
  await page.goto("/teacher?experiment=evolution");
  await page.getByRole("banner").getByRole("combobox").selectOption("en");
  const mode = page.getByRole("combobox", { name: "Game", exact: true });
  await mode.selectOption("memo");
  await expect(page.getByLabel("Decision time (s)")).toHaveValue("5");
  for (const [value, code] of [
    [undefined, "memoAnswerRequired"],
    ["", "memoAnswerRequired"],
    ["abc", "memoAnswerNumber"],
    [0, "memoAnswerNumber"],
    ["0", "memoAnswerPositive"],
    ["-1.5", "memoAnswerPositive"],
    ["1.500000000000000001", "memoAnswerPrecision"],
  ] as const) {
    const response = await page.request.post("/api/evolution/rooms", {
      data: {
        title: "Invalid",
        password: "review-password",
        settings: { ...memoDefaults(), memoAnswerSeconds: value },
      },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe(code);
  }
  await mode.selectOption("coordination");
  await expect(
    page.getByRole("table", { name: "Payoff matrix" }),
  ).toBeVisible();
  await expect(page.getByLabel("Feedback time (s)")).toHaveValue("8");
  await mode.selectOption("memo");
  await expect(
    page.getByText("Your score for the round is the average of those points."),
  ).toHaveCount(0);
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

  const code = new URL(page.url()).pathname.split("/").pop()!;
  const studentContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 740 },
  });
  const synthetic = await playwright.request.newContext({ baseURL });
  try {
    const student = await studentContext.newPage();
    await student.goto("/?code=" + code);
    await student.locator('input[name="nickname"]').fill("Browser");
    await student.locator('input[name="pin"]').fill("1234");
    await student.getByRole("button", { name: "入室する" }).click();
    await expect(student).toHaveURL(/\/room\//);
    await student.getByRole("banner").getByRole("combobox").selectOption("en");
    await expect(
      student.getByRole("heading", { name: "Admission open" }).first(),
    ).toBeVisible();
    await expect(
      student.getByRole("button", { name: "Rules", exact: true }),
    ).toHaveCount(0);

    for (let i = 1; i < 150; i++) {
      const joined = await synthetic.post(`/api/rooms/${code}/join`, {
        data: { nickname: `Seat${i}`, pin: "1234" },
      });
      expect(
        joined.ok(),
        `Admission of synthetic seat ${i}, HTTP ${joined.status()}`,
      ).toBe(true);
      await joined.dispose();
    }
    await page.getByRole("button", { name: "Close admission" }).click();
    await page.getByRole("button", { name: "Confirm and start" }).click();
    await expect(student.getByText(/Round 1\/120/)).toBeVisible();
    const initialLayout = await studentLayout(student);
    await expect(
      student.getByText(/Your whole group plays (Hare|Stag) in rounds 1–10\./),
    ).toBeVisible();
    await expect(
      student.getByText("Decisions open", { exact: true }),
    ).toHaveCount(0);
    await expect(
      student.getByRole("button", { name: "Hare", exact: true }),
    ).toBeDisabled();
    await expect(
      student.getByRole("progressbar", { name: "Group hare share" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    expect(await studentLayout(student)).toEqual(initialLayout);
    await checkStudentViewport(student, testInfo, "formal");
    await expect(
      student.getByRole("heading", { name: "Rules", exact: true }),
    ).toHaveCount(0);
    await expect(
      student.getByText("Only those selected can change their choice"),
    ).toHaveCount(0);
    const settled = await expectTeacherStats(page, 1, [
      "0/10",
      "0",
      "0",
      "10/10",
    ]);
    await expect(settled.getByRole("meter")).toHaveCount(2);
    await page
      .getByRole("combobox", { name: "Group", exact: true })
      .selectOption("15");
    await expectTeacherStats(page, 1, ["0/10", "0", "0", "10/10"]);
    const output = await page.request.get(
      `/api/rooms/${code}/evolution/export?format=json`,
    );
    await expect(output).toBeOK();
    const { settings, rows } = await output.json();
    expect(settings.memoAnswerSeconds).toBe("5");
    const delivered = rows.find(
      (row: {
        round: number;
        feedbackHare: number | null;
        feedbackServedAt: number | null;
      }) =>
        row.round === 2 &&
        row.feedbackHare !== null &&
        row.feedbackServedAt !== null,
    );
    expect(delivered.groupSize).toBe(10);
    expect(delivered.eligible).toBe(false);
    expect(delivered.feedbackGroupSize).toBe(10);
    await checkTeacherViewport(page);
  } finally {
    await synthetic.dispose();
    await studentContext.close();
  }
});
