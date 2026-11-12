import { signInTeacher } from "./helpers/teacher-login";
import { expectEndButton } from "./helpers/end-experiment";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await signInTeacher(page.request);
});

async function expectCountdownPlacement(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const card = document
          .querySelector(".emh-countdown-card")!
          .getBoundingClientRect();
        const panel = document
          .querySelector(".emh-conditions")!
          .getBoundingClientRect();
        const arrow = document
          .querySelector(".study-conditions-arrow")!
          .getBoundingClientRect();
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        return (
          Math.abs((card.left + card.right - panel.left - panel.right) / 2) <
            1 &&
          Math.abs(panel.top - card.bottom - 40) < 1 &&
          card.left >= 0 &&
          card.right <= innerWidth &&
          card.top >= 0 &&
          card.bottom <= innerHeight &&
          arrow.left >= 0 &&
          arrow.right <= innerWidth &&
          arrow.top >= 0 &&
          arrow.bottom <= innerHeight &&
          panel.top >= 0 &&
          panel.top < innerHeight - 50 &&
          !overlaps(card, panel) &&
          !overlaps(card, arrow)
        );
      }),
    )
    .toBe(true);
}

test("EMH Demo shares formal settings and confirms or releases them before trading", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push(request.url());
  });
  await page.goto("/emh/demo");
  await expect(
    page.getByRole("heading", { name: "EMH · 資産市場実験" }),
  ).toBeVisible();
  await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("教員パスワード", { exact: false })).toHaveCount(
    0,
  );
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
  await expect(page.locator('[name="periodMinutes"]')).toHaveValue("4");
  await page.locator('[name="initialUnits"]').fill("5");
  await page.locator('[name="targetMarketSize"]').fill("8");
  await page.locator('[name="typeRatio1"]').fill("2");
  await page.locator('[name="periodMinutes"]').fill("1.5");
  await page
    .getByRole("button", { name: "デモルームを作成", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "8人が入室", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("4 / 2 / 2");
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 40単位",
  );
  const assign = page.getByRole("button", {
    name: "分け方を確定して受付終了",
    exact: true,
  });
  await page.locator('[name="initialUnits"]').fill("6");
  await expect(assign).toBeDisabled();
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 48単位",
  );
  await assign.click();
  await expect(page.locator(".emh-settings-summary")).toContainText(
    "1人 6単位",
  );
  await expect(page.locator(".emh-settings-summary")).toContainText("90秒");
  await expect(page.locator('[name="initialUnits"]')).toHaveCount(0);
  await page
    .getByRole("button", { name: "割り当てを解除", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "解除して受付再開", exact: true })
    .click();
  await page.locator('[name="targetMarketSize"]').fill("12");
  await page.getByRole("button", { name: "設定を保存", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "12人が入室", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("6 / 3 / 3");
  await expect(page.locator(".emh-allocation")).toContainText(
    "総証券数 72単位",
  );
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await assign.click();
  await page
    .locator(".emh-session-settings")
    .screenshot({ path: info.outputPath("demo-locked-conditions.png") });
  await page
    .getByRole("button", { name: "全市場で実験を開始", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "割り当てを解除", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await page
    .getByRole("button", { name: "学生画面を見る", exact: true })
    .click();
  await expect(page.locator(".stat-grid")).toContainText("円");
  for (const dividend of await page
    .locator(".emh-conditions .private-dividends")
    .all()) {
    await expect(dividend).toContainText("円");
  }
  await expect(
    page.locator(".emh-conditions .study-price-input > span"),
  ).toHaveText(["円", "円"]);
  await expect(
    page.getByText("一時停止中", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator(".emh-session-settings")).toHaveCount(0);
  await page
    .getByRole("button", { name: "教員画面を見る", exact: true })
    .click();
  await page.getByRole("button", { name: "実験条件", exact: true }).click();
  await expect(page.locator(".emh-settings-summary")).toContainText("90秒");
  await page.getByRole("button", { name: "設定を見直す", exact: true }).click();
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("6");
  await expect(page.locator('[name="targetMarketSize"]')).toHaveValue("12");
  await expect(page.locator('[name="periodMinutes"]')).toHaveValue("1.5");
  await page.reload();
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("Exp2 demo runs the default 12-person market with practice information", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() !== "GET" &&
      new URL(request.url()).pathname.startsWith("/api/")
    )
      writes.push(request.url());
  });
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await expect(page.locator('[name="initialUnits"]')).toHaveValue("2");
  await page.getByLabel("各ラウンドの時間（分）").fill("3");
  await page.getByLabel("ラウンド数").fill("3");
  await page.getByLabel("1取引の時間（秒）").fill("15");
  await page.getByLabel("休憩時間（秒）").fill("45");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await expect(page.getByRole("heading", { name: "12人が入室" })).toBeVisible();
  await expect(page.locator(".emh-allocation")).toContainText("4 / 4 / 4");
  await expect(page.getByLabel("ラウンド数")).toHaveValue("3");
  await expect(page.getByLabel("1取引の時間（秒）")).toHaveValue("15");
  await expect(page.getByLabel("休憩時間（秒）")).toHaveValue("45");
  await page.getByLabel("休憩時間（秒）").fill("40");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await expect(page.locator(".emh-settings-summary")).toContainText("180秒");
  await expect(page.locator(".emh-settings-summary")).toContainText("3回");
  await expect(page.locator(".emh-settings-summary")).toContainText("15秒");
  await expect(page.locator(".emh-settings-summary")).toContainText("40秒");
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  const conditions = page.getByRole("button", {
    name: "実験条件",
    exact: true,
  });
  await expect(conditions).toHaveAttribute("aria-expanded", "false");
  await conditions.click();
  await expect(page.locator("#demo-conditions")).toContainText("180秒");
  await conditions.click();
  await expect(page.locator("#demo-conditions")).toHaveCount(0);
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(
    page
      .getByRole("list", { name: "ラウンドの進行" })
      .getByRole("listitem", { name: "第1ラウンド" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".session-phase")).not.toContainText("第1ラウンド");
  await expect(page.locator(".period-badge")).toHaveCount(0);
  const roundIndicators = await page
    .locator(".exp2-rounds .round-step > span")
    .all();
  await expect(roundIndicators[0]!).toHaveCSS(
    "background-color",
    "rgb(244, 203, 81)",
  );
  const firstRound = await roundIndicators[0]!.boundingBox();
  const secondRound = await roundIndicators[1]!.boundingBox();
  expect(
    secondRound!.x - (firstRound!.x + firstRound!.width),
  ).toBeLessThanOrEqual(16);
  await expect(page.getByText("Clue カード")).toBeVisible();
  await expect(page.getByText("情報なし")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "状態別の配当、確率と期待配当" }),
  ).toBeVisible();
  await expect(page.locator(".exp2-state-values > div")).toHaveCount(3);
  await expect(page.locator(".exp2-state-realized")).toHaveCount(0);
  for (const state of await page.locator(".exp2-state-values > div").all()) {
    await expect(state).toContainText("円");
    await expect(state).toContainText("%");
    await expect(state).toContainText("期待配当");
  }
  await expect(page.getByText("期待配当合計")).toHaveCount(0);
  await expect(page.locator(".emh-conditions")).not.toContainText("見込利益");
  for (const width of [1366, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const cards = await page
      .locator(".emh-personal-account > div")
      .evaluateAll((elements) =>
        elements.map((element) => {
          const label = element.firstElementChild!;
          const range = document.createRange();
          range.selectNodeContents(label);
          const labelLines = new Set(
            Array.from(range.getClientRects(), (rect) => Math.round(rect.top)),
          ).size;
          return {
            top: element.getBoundingClientRect().top,
            left: element.getBoundingClientRect().left,
            width: element.getBoundingClientRect().width,
            height: element.getBoundingClientRect().height,
            border: getComputedStyle(element).borderTopWidth,
            overflow: element.scrollWidth > element.clientWidth,
            labelLines,
          };
        }),
      );
    expect(cards).toHaveLength(3);
    expect(
      Math.max(...cards.map((card) => card.top)) -
        Math.min(...cards.map((card) => card.top)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.max(...cards.map((card) => card.height)) -
        Math.min(...cards.map((card) => card.height)),
    ).toBeLessThanOrEqual(1);
    expect(
      cards.every(
        (card) =>
          card.border === "1px" && !card.overflow && card.labelLines === 1,
      ),
    ).toBe(true);
    const accountSize = await page
      .locator(".emh-personal-account")
      .evaluate((element) => ({
        scroll: element.scrollWidth,
        client: element.clientWidth,
      }));
    expect(accountSize.scroll, `viewport ${width}`).toBeLessThanOrEqual(
      accountSize.client,
    );
    expect(cards[0].left).toBeLessThan(cards[1].left);
    expect(cards[1].left).toBeLessThan(cards[2].left);
    const sampleFits = await page
      .locator(".emh-personal-account")
      .evaluate((account) => {
        const values = Array.from(account.querySelectorAll("strong"));
        const originals = values.map((value) => value.innerHTML);
        values[0].innerHTML = "99<small>単位</small>";
        values[1].innerHTML = '-99,999<span class="yen-unit">円</span>';
        values[2].innerHTML = '-99,999<span class="yen-unit">円</span>';
        const cards = Array.from(account.children);
        const fits =
          account.scrollWidth <= account.clientWidth &&
          cards.every((card) => card.scrollWidth <= card.clientWidth) &&
          cards.every(
            (card, index) =>
              index === 0 ||
              cards[index - 1].getBoundingClientRect().right <=
                card.getBoundingClientRect().left,
          );
        values.forEach((value, index) => {
          value.innerHTML = originals[index];
        });
        return fits;
      });
    expect(sampleFits, `sample amounts at viewport ${width}`).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("heading", { name: "取引記録" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "配当・損益の記録" }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "市場" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "注文板" })).toBeVisible();
  const buyColumn = page.locator(".student-action-column.buy-side");
  const sellColumn = page.locator(".student-action-column.sell-side");
  await expect(buyColumn).toHaveCSS("border-top-width", "1px");
  await expect(sellColumn).toHaveCSS("border-top-width", "1px");
  await expect(
    buyColumn.getByRole("button", { name: "買い成行注文" }),
  ).toBeVisible();
  await expect(buyColumn.getByLabel("買値（円）")).toBeVisible();
  await expect(
    sellColumn.getByRole("button", { name: "売り成行注文" }),
  ).toBeVisible();
  await expect(sellColumn.getByLabel("売値（円）")).toBeVisible();
  expect((await buyColumn.boundingBox())!.x).toBeLessThan(
    (await sellColumn.boundingBox())!.x,
  );
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
  await page.getByLabel("買値（円）", { exact: true }).fill("1");
  await page.getByLabel("売値（円）", { exact: true }).fill("99999");
  await page.getByRole("button", { name: "買い指値注文" }).click();
  await expect(page.locator("[aria-label='買い注文一覧']")).toContainText(
    "あなた含む",
  );
  await expect(page.locator("[aria-label='買い注文一覧'] thead")).toContainText(
    "円",
  );
  await page.getByRole("button", { name: "売り指値注文" }).click();
  await expect(page.locator("[aria-label='売り注文一覧']")).toContainText(
    "あなた含む",
  );
  await expect(page.locator("[aria-label='売り注文一覧'] thead")).toContainText(
    "円",
  );
  const ownBook = page.locator(".study-order-book");
  await expect(ownBook.locator("tr.study-own-order")).toHaveCount(2);
  await ownBook.getByRole("button", { name: "買値を取り消す" }).click();
  await expect(
    ownBook.getByRole("button", { name: "買値を取り消す" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "買い指値注文" }).click();
  await ownBook.getByRole("button", { name: "売値を取り消す" }).click();
  await expect(
    ownBook.getByRole("button", { name: "売値を取り消す" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "売り指値注文" }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("売値（円）", { exact: true })).toHaveValue(
    "99999",
  );
  await page.getByRole("button", { name: "教員画面を見る" }).click();
  const tabWidths = await page
    .getByRole("tablist", { name: "表示内容" })
    .getByRole("tab")
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getBoundingClientRect().width),
    );
  expect(new Set(tabWidths).size).toBe(1);
  for (let round = 1; round <= 2; round++) {
    await page.getByRole("button", { name: "期を終了" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "配当を確定して進む" })
      .click();
    if (round === 1) {
      await page.getByRole("button", { name: "学生画面を見る" }).click();
      const realized = page.locator(
        ".exp2-state-values > .exp2-state-realized",
      );
      await expect(realized).toHaveCount(1);
      const realizedState = (await realized.textContent())!.match(
        /状態\s*([123])/,
      )?.[1];
      expect(realizedState).toBeDefined();
      await expect(realized).toContainText("実現");
      await expect(realized).toHaveCSS("animation-name", "emh-state-reveal");
      await realized.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath("exp2-state-reveal.png") });
      await page
        .locator(".emh-conditions")
        .screenshot({ path: info.outputPath("exp2-conditions.png") });
      await expect(
        page.locator(".exp2-private-values [role='status']"),
      ).toHaveText(`実現した状態は状態 ${realizedState} です`);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(realized).toHaveCSS("animation-name", "none");
      await expect(realized).toContainText("実現");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.getByRole("button", { name: "教員画面を見る" }).click();
    }
    await page.getByRole("button", { name: "次へ", exact: true }).click();
    if (round === 1) {
      await page.getByRole("button", { name: "学生画面を見る" }).click();
      await expect(page.locator(".exp2-state-realized")).toHaveCount(0);
      await page.getByRole("button", { name: "教員画面を見る" }).click();
    }
  }
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.getByText("Clue カード")).toBeVisible();
  await expect(page.locator(".results-panel tbody tr")).toHaveCount(2);
  await expect(page.locator(".results-panel thead")).toContainText("円");
  for (const width of [1366, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const heading of await page.locator(".results-panel thead th").all()) {
      expect(
        await heading.evaluate(
          (element) => getComputedStyle(element).whiteSpace,
        ),
      ).toBe("nowrap");
    }
    for (const table of await page
      .locator(".student-market-grid .table-scroll")
      .all()) {
      if (
        width <= 760 &&
        (await table.locator("xpath=..").getAttribute("class"))?.includes(
          "results-panel",
        )
      )
        continue;
      const size = await table.evaluate((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
        panel: element.parentElement?.className,
      }));
      expect(
        size.content,
        JSON.stringify({ viewport: width, ...size }),
      ).toBeLessThanOrEqual(size.width);
    }
  }
  await page.getByRole("button", { name: "設定を見直す" }).click();
  await expect(page.getByRole("combobox", { name: "実験" })).toHaveValue(
    "exp2",
  );
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});

test("Exp1 student demo shows the trading board, prices and records together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/emh/demo");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(
    page
      .getByRole("list", { name: "ラウンドの進行" })
      .getByRole("listitem", { name: "第1ラウンド、A期" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".round-step.active i.active")).toHaveText("A");
  await expect(page.locator(".round-step.active i.active")).toHaveCSS(
    "background-color",
    "rgb(244, 203, 81)",
  );
  await expect(page.locator(".session-phase")).not.toContainText("第1ラウンド");
  await expect(page.locator(".emh-conditions")).not.toContainText("見込利益");
  for (const name of ["注文板", "取引記録", "配当・損益の記録"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByRole("tab", { name: "市場" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "自分の記録" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "提示の種類" })).toHaveCount(0);
  await expect(page.getByLabel("買値（円）")).toBeVisible();
  await expect(page.getByLabel("売値（円）")).toBeVisible();
  const columns = await page
    .locator(".student-market-grid > *")
    .evaluateAll((elements) =>
      elements.map((el) => ({
        top: el.getBoundingClientRect().top,
        left: el.getBoundingClientRect().left,
      })),
    );
  expect(columns).toHaveLength(3);
  expect(
    Math.max(...columns.map((item) => item.top)) -
      Math.min(...columns.map((item) => item.top)),
  ).toBeLessThanOrEqual(1);
  expect(columns[0].left).toBeLessThan(columns[1].left);
  expect(columns[1].left).toBeLessThan(columns[2].left);
  for (const width of [1175, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.getByLabel("買値（円）")).toBeVisible();
    await expect(page.getByLabel("売値（円）")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "配当・損益の記録" }),
    ).toBeVisible();
  }
});

test("student views use three font sizes and equal state dividend and probability sizes", async ({
  page,
}) => {
  for (const experiment of ["exp1", "exp2"]) {
    await page.goto("/emh/demo");
    if (experiment === "exp2")
      await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
    await page.getByRole("button", { name: "デモルームを作成" }).click();
    await page
      .getByRole("button", { name: "分け方を確定して受付終了" })
      .click();
    await page.getByRole("button", { name: "全市場で実験を開始" }).click();
    await page
      .getByRole("region", { name: "ひとりデモの操作" })
      .getByRole("button", { name: "一時停止", exact: true })
      .click();
    await page.getByRole("button", { name: "学生画面を見る" }).click();
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes = await page.locator(".emh-student-view").evaluate((root) => {
        const values = new Set<string>();
        for (const element of [root, ...root.querySelectorAll("*")]) {
          if (
            element.getClientRects().length === 0 ||
            getComputedStyle(element).visibility !== "visible"
          )
            continue;
          if (
            Array.from(element.childNodes).some(
              (node) =>
                node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
            )
          ) {
            values.add(getComputedStyle(element).fontSize);
          }
        }
        return [...values].sort();
      });
      expect(sizes).toEqual(["12px", "16px", "24px"]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (experiment === "exp2") {
        for (const state of await page
          .locator(".exp2-state-values > div")
          .all()) {
          const dividend = await state
            .locator(".exp2-state-line strong")
            .first()
            .evaluate((el) => getComputedStyle(el).fontSize);
          const probability = await state
            .locator(".exp2-state-line")
            .nth(1)
            .locator("strong")
            .evaluate((el) => getComputedStyle(el).fontSize);
          expect(dividend).toBe(probability);
          await expect(state.locator(".exp2-expected-contribution")).toHaveCSS(
            "border-top-width",
            "1px",
          );
          const metrics = await state.evaluate((element) => {
            const labels = [
              ...element.querySelectorAll(".exp2-state-line > span"),
            ].slice(0, 2);
            const values = [
              ...element.querySelectorAll(
                ".exp2-state-line > strong, .exp2-state-line > small",
              ),
            ];
            return {
              tops: labels.map((label) => label.getBoundingClientRect().top),
              colors: values.map((value) => getComputedStyle(value).color),
            };
          });
          expect(
            Math.abs(metrics.tops[0] - metrics.tops[1]),
          ).toBeLessThanOrEqual(1);
          expect(metrics.colors[0]).toBe(metrics.colors[1]);
        }
      }
    }
  }
});

for (const experiment of ["exp1", "exp2"] as const) {
  test(`${experiment} demo keeps submitted orders, both draft prices and focus across a timed-out trading unit`, async ({
    page,
  }) => {
    const start = Date.now();
    await page.clock.install({ time: new Date(start) });
    await page.clock.pauseAt(new Date(start + 1000));
    await page.goto("/emh/demo");
    await page.getByRole("combobox", { name: "実験" }).selectOption(experiment);
    await page.getByLabel("1取引の時間（秒）").fill("5");
    await page.getByRole("button", { name: "デモルームを作成" }).click();
    await page
      .getByRole("button", { name: "分け方を確定して受付終了" })
      .click();
    await page.getByRole("button", { name: "全市場で実験を開始" }).click();
    await page.getByRole("button", { name: "学生画面を見る" }).click();
    // One virtual trader submits only bids, so the unit expires without a bot-to-bot trade.
    await page.evaluate(() => {
      Math.random = () => 0.25;
    });
    await page.clock.fastForward(5000);
    await expect(
      page.getByText("第1取引の残り", { exact: true }),
    ).toBeVisible();
    const bid = page.getByLabel("買値（円）", { exact: true });
    const ask = page.getByLabel("売値（円）", { exact: true });
    const book = page.locator(".study-order-book");
    await bid.fill("1");
    await page
      .getByRole("button", { name: "買い指値注文", exact: true })
      .click();
    await ask.fill("99999");
    await page
      .getByRole("button", { name: "売り指値注文", exact: true })
      .click();
    await expect(book.locator("tr.study-own-order")).toHaveCount(2);
    await ask.fill("220");
    await bid.fill("100");
    await page.clock.fastForward(5000);
    await expect(
      page.getByText("第2取引の残り", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".inactivity")).toContainText("連続1回");
    await expect(ask).toHaveValue("220");
    await expect(bid).toHaveValue("100");
    await expect(bid).toBeFocused();
    await bid.press("5");
    await expect(bid).toHaveValue("1005");
    await expect(book.locator("tr.study-own-order")).toHaveCount(2);
    await expect(book.getByRole("button", { name: /取り消す/ })).toHaveCount(2);
    await page.getByRole("button", { name: "次の期へ" }).click();
    await expect(
      page
        .getByText(experiment === "exp1" ? "Period B" : "第2ラウンド", {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(bid).toHaveValue("");
    await expect(ask).toHaveValue("");
    await expect(book.locator("tr.study-own-order")).toHaveCount(0);
    await expect(book.getByRole("button", { name: /取り消す/ })).toHaveCount(0);
  });
}

test("demo countdown displays private conditions before trading and can be paused", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await expect(page.getByText("開始まで", { exact: true })).toBeVisible();
  await expect(page.locator(".emh-countdown-card")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "期を終了" })).toBeDisabled();
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  const countdownCard = page.locator(".emh-countdown-card");
  await expect(countdownCard).toContainText("開始前に一時停止しています");
  await expect(countdownCard).toContainText(
    "教員が再開するまでお待ちください。",
  );
  const countdownValue = await countdownCard.locator("strong").textContent();
  const bounds = await countdownCard.boundingBox();
  expect(bounds).not.toBeNull();
  const conditions = page.locator(".emh-conditions");
  const conditionsBounds = await conditions.boundingBox();
  const countdownDocumentTop = await conditions.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(conditionsBounds).not.toBeNull();
  await expect(conditions).toHaveClass(/study-conditions-review/);
  await expect(conditions.locator(".study-conditions-arrow")).toBeVisible();
  await expect(page.getByRole("heading", { name: "注文板" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("countdown-desktop.png") });
  await page.evaluate(() => window.scrollBy(0, -40));
  await expectCountdownPlacement(page);
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1200, 720],
    [1024, 768],
    [768, 1024],
    [640, 360],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await expectCountdownPlacement(page);
    if (width === 390) {
      await page.screenshot({ path: info.outputPath("countdown-mobile.png") });
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(
    page.getByRole("group", { name: "状態別の配当、確率と期待配当" }),
  ).toBeVisible();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeDisabled();
  const clock = page.locator(".session-bar .timer");
  const pausedClock = await clock.textContent();
  await page.waitForTimeout(1100);
  await expect(clock).toHaveText(pausedClock!);
  await expect(countdownCard.locator("strong")).toHaveText(countdownValue!);
  await page.getByRole("button", { name: "再開", exact: true }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
  await expect(countdownCard).toHaveCount(0);
  await expect(conditions).not.toHaveClass(/study-conditions-review/);
  await expect(conditions.locator(".study-conditions-arrow")).toHaveCount(0);
  const tradingBounds = await conditions.boundingBox();
  const tradingDocumentTop = await conditions.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(Math.abs(conditionsBounds!.x - tradingBounds!.x)).toBeLessThan(1);
  expect(Math.abs(conditionsBounds!.width - tradingBounds!.width)).toBeLessThan(
    1,
  );
  expect(Math.abs(countdownDocumentTop - tradingDocumentTop)).toBeLessThan(16);
  await expect(page.getByText("期の残り", { exact: true })).toBeVisible();
});

test("Exp1 student countdown highlights the trading conditions and clears when trading opens", async ({
  page,
}) => {
  await page.goto("/emh/demo");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "一時停止", exact: true })
    .click();
  await page.getByRole("button", { name: "学生画面を見る" }).click();
  const card = page.locator(".emh-countdown-card");
  const conditions = page.locator(".emh-conditions");
  await expect(card).toContainText("開始前に一時停止しています");
  await expect(card.locator("strong")).toHaveText(/^[1-5]$/);
  await expect(conditions).toHaveClass(/study-conditions-review/);
  await expect(conditions.locator(".study-conditions-arrow")).toBeVisible();
  const countdownBounds = await conditions.boundingBox();
  const countdownDocumentTop = await conditions.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1366, 768],
    [1200, 720],
    [1024, 768],
    [768, 1024],
    [640, 360],
    [390, 844],
    [320, 568],
  ]) {
    await page.setViewportSize({ width, height });
    await expectCountdownPlacement(page);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.locator(".study-start-countdown")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await expect(page.getByLabel("買値（円）")).toBeDisabled();
  await page
    .getByRole("region", { name: "ひとりデモの操作" })
    .getByRole("button", { name: "再開", exact: true })
    .click();
  await expectCountdownPlacement(page);
  await expect(card).toHaveCount(0, { timeout: 12000 });
  await expect(page.getByLabel("買値（円）")).toBeEnabled();
  await expect(conditions).not.toHaveClass(/study-conditions-review/);
  const tradingBounds = await conditions.boundingBox();
  const tradingDocumentTop = await conditions.evaluate(
    (element) => element.getBoundingClientRect().top + window.scrollY,
  );
  expect(Math.abs(countdownBounds!.x - tradingBounds!.x)).toBeLessThan(1);
  expect(Math.abs(countdownBounds!.width - tradingBounds!.width)).toBeLessThan(
    1,
  );
  expect(Math.abs(countdownDocumentTop - tradingDocumentTop)).toBeLessThan(16);
});

test("EMH demo controls preserve the session while switching views, advancing and resetting", async ({
  page,
}) => {
  await page.goto("/emh/demo");
  await page.getByRole("combobox", { name: "実験" }).selectOption("exp2");
  await page.getByLabel("各ラウンドの時間（分）").fill("3");
  await page.getByLabel("1取引の時間（秒）").fill("100");
  await page.getByRole("button", { name: "デモルームを作成" }).click();
  const panel = page.getByRole("region", { name: "ひとりデモの操作" });
  await expect(
    panel.getByRole("button", { name: "30秒進める" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "分け方を確定して受付終了" }).click();
  await page.getByRole("button", { name: "全市場で実験を開始" }).click();
  await expect(panel.getByRole("button", { name: "次の期へ" })).toBeDisabled();
  await panel.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.getByLabel("買値（円）", { exact: true })).toBeEnabled({
    timeout: 12000,
  });
  await panel.getByRole("button", { name: "一時停止" }).click();
  const pausedTime = await page
    .locator(".session-bar .timer")
    .first()
    .textContent();
  await panel.getByRole("button", { name: "教員画面を見る" }).click();
  await panel.getByRole("button", { name: "学生画面を見る" }).click();
  await expect(page.locator(".session-bar .timer").first()).toHaveText(
    pausedTime!,
  );
  await expect(
    panel.getByRole("button", { name: "30秒進める" }),
  ).toBeDisabled();
  await panel.getByRole("button", { name: "再開" }).click();
  await panel.getByRole("button", { name: "30秒進める" }).click();
  await expect(page.locator(".session-bar .timer").first()).toContainText(
    "02:2",
  );
  await panel.getByRole("button", { name: "次の期へ" }).click();
  await expect(
    page.getByRole("listitem", { name: "第2ラウンド", exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    page.getByRole("button", { name: "実験を終了", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("button", { name: "教員画面を見る" }).click();
  await (await expectEndButton(page)).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "終了する" })
    .click();
  await expect(
    page.getByText("実験が終了しました。結果と記録を確認できます。"),
  ).toBeVisible();
  await panel.getByRole("button", { name: "学生画面を見る" }).click();
  await panel.getByRole("button", { name: "やり直す" }).click();
  await panel.getByRole("button", { name: "教員画面を見る" }).click();
  await expect(page.getByRole("heading", { name: "12人が入室" })).toBeVisible();
  await expect(page.getByLabel("1取引の時間（秒）")).toHaveValue("100");
});
