import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { enterTeacherPage, signInTeacher } from "./helpers/teacher-login";

const labels = {
  en: {
    stag: "Stag",
    hare: "Hare",
    payoff: "Points against one opponent",
    share: "Group hare share",
    prior: "Previous round",
    revision: "This round’s revision",
    round: "Round",
  },
  ja: {
    stag: "鹿",
    hare: "兎",
    payoff: "相手1人あたりの点数",
    share: "グループ内の兎の割合",
    prior: "前回の結果",
    revision: "今回の見直し",
    round: "ラウンド",
  },
  "zh-CN": {
    stag: "鹿",
    hare: "兔",
    payoff: "对单个对手的得分",
    share: "组选兔比例",
    prior: "上轮结果",
    revision: "本轮改选",
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
    await expect(headings).toContainText([names.prior, names.revision]);
    await expect(payoff.locator("td")).toHaveText(["4", "0", "3", "3"]);
    await expect(share).toBeVisible();
    const axisLabels = page.locator(".ev-memo-feedback svg text");
    const text = await axisLabels.allTextContents();
    expect(text.slice(0, 3)).toEqual(["100%", "50%", "0%"]);
    expect(text.at(-1)).toBe(names.round);

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
            ".ev-memo-choice, .ev-memo-feedback, .ev-memo-revision, .ev-account",
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
  await expect(page.getByLabel("Decision time (s)")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Close admission" }).click();
  await page.getByRole("button", { name: "Confirm and start" }).click();
  await page.getByRole("button", { name: "View student screen" }).click();
  await expect(page.getByText(/Block 1\/3.*Round 1\/120/)).toBeVisible();
  await expect(
    page.getByText(
      "Everyone in your group plays Hare for the first 10 rounds.",
    ),
  ).toBeVisible();
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
  const initialLayout = await studentLayout(page);
  await page.getByRole("button", { name: "Advance 30 s" }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".ev-memo-proportion strong")).toHaveText("100%");
  expect(await studentLayout(page)).toEqual(initialLayout);
  await expect(page.getByRole("img", { name: /Round 5: 100%/ })).toBeVisible();
  await expect(page.locator(".ev-memo-payoffs")).toContainText("My payoff3");
  await checkStudentViewport(page, testInfo, "demo");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.getByRole("button", { name: "Advance 30 s" }).click();
  await expect(page.getByText(/Round 11\/120/)).toBeVisible();
  await expect(
    page.getByText("You can revise your choice this round."),
  ).toBeVisible();
  expect(await studentLayout(page)).toEqual(initialLayout);
  await page.getByRole("button", { name: "Hare", exact: true }).click();
  await expect(page.getByText("Choice received.")).toBeVisible();
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
    page.getByText("You weren’t selected. Your previous choice carries over."),
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
  await expect(trend.locator("text")).toHaveText([
    "100%",
    "50%",
    "0%",
    "6",
    "11",
    "16",
    "20",
    "25",
    "Round",
  ]);
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
  await mode.selectOption("coordination");
  await expect(
    page.getByRole("table", { name: "Payoff matrix" }),
  ).toBeVisible();
  await expect(page.getByLabel("Feedback time (s)")).toHaveValue("8");
  await mode.selectOption("memo");
  await expect(
    page.getByText("Your score for the round is the average of those points."),
  ).toBeVisible();
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
      student.getByText(
        /Everyone in your group plays (Hare|Stag) for the first 10 rounds\./,
      ),
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
    const { rows } = await output.json();
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
