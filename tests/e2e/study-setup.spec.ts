import { expect, test } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

test("pre-creation settings use a separate dialog with save and close", async ({
  page,
}) => {
  await page.goto("/teacher?experiment=institutions");
  await enterTeacherPage(page);
  const open = page.getByRole("button", {
    name: "作成前に詳細を設定",
    exact: true,
  });
  const commission = page.getByLabel("Commission（円／1単位・1人）", {
    exact: true,
  });
  await expect(commission).toHaveCount(0);
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "実験の詳細設定",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(commission).toBeHidden();
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
  await expect(
    dialog
      .getByRole("group", { name: "CDA", exact: true })
      .getByLabel("CDA：1期の取引時間（秒）", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("0");
  const next = dialog.getByRole("button", {
    name: "確定して次へ",
    exact: true,
  });
  await expect(next).toBeDisabled();
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("3");
  await next.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toBeHidden();
  await expect(
    dialog.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("市場・人数");
  await expect(
    dialog.getByLabel("CDAの1人あたりの単位数", { exact: true }),
  ).toBeHidden();
  await next.click();
  const preset = dialog.getByRole("region", {
    name: "供需プリセット",
    exact: true,
  });
  const units = preset.getByLabel("CDAの1人あたりの単位数", { exact: true });
  await expect(units).toBeVisible();
  await expect(commission).toBeVisible();
  await expect(commission).toHaveValue("1");
  const save = dialog.getByRole("button", {
    name: "設定を保存して閉じる",
    exact: true,
  });
  await expect(save).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "この条件を確認して採用", exact: true }),
  ).toHaveCount(0);
  await units.fill("");
  await expect(units).toBeVisible();
  await expect(save).toBeDisabled();
  await units.fill("2");
  await dialog
    .getByLabel("Commission（円／1単位・1人）", { exact: true })
    .fill("2");
  await save.click();
  await expect(dialog).toBeHidden();
  await expect(commission).toHaveCount(0);
  await expect(
    page.getByLabel("教員パスワード", { exact: false }),
  ).toBeVisible();
  await open.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toHaveValue(
    "3",
  );
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("9");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await open.click();
  await expect(dialog.getByLabel("CDAの期数", { exact: true })).toHaveValue(
    "3",
  );
  await next.click();
  await next.click();
  await expect(
    dialog.getByLabel("Commission（円／1単位・1人）", { exact: true }),
  ).toHaveValue("2");
  await expect(
    dialog.getByRole("heading", {
      name: "CDA：Defaultのプレビュー",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator(".teacher-units-panel")).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "供需プリセット", exact: true })
    .selectOption("overlap");
  const preview = dialog.locator(
    ".study-generated-preview > .study-condition-preview .study-condition-summary",
  );
  await expect(preview).toContainText("80 円");
  await dialog.getByLabel("均衡価格 p（円）", { exact: true }).fill("90");
  await expect(preview).toContainText("90 円");
  await dialog.getByLabel("正の余剰の単位数 K", { exact: true }).fill("7");
  await dialog.getByLabel("横向き重なりの長さ L", { exact: true }).fill("3");
  await dialog.getByLabel("階段の価格差 d（円）", { exact: true }).fill("6");
  await dialog.getByLabel("割当シード", { exact: true }).fill("42");
  await dialog
    .getByRole("combobox", { name: "供需プリセット", exact: true })
    .selectOption("existing");
  await expect(preview).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: "CDA：Defaultのプレビュー",
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator(".teacher-units-panel")).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "供需プリセット", exact: true })
    .selectOption("overlap");
  await expect(
    dialog.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toHaveValue("80");
  await expect(
    dialog.getByLabel("正の余剰の単位数 K", { exact: true }),
  ).toHaveValue("8");
  await expect(
    dialog.getByLabel("横向き重なりの長さ L", { exact: true }),
  ).toHaveValue("4");
  await expect(
    dialog.getByLabel("階段の価格差 d（円）", { exact: true }),
  ).toHaveValue("4");
  await expect(dialog.getByLabel("割当シード", { exact: true })).toHaveValue(
    "123456",
  );
  await expect(preview).toContainText("80 円");
  await dialog.getByLabel("均衡価格 p（円）", { exact: true }).fill("95");
  await dialog.getByLabel("正の余剰の単位数 K", { exact: true }).fill("20");
  await expect(dialog.getByRole("alert")).toContainText("K＋L");
  await expect(preview).toHaveCount(0);
  await expect(save).toBeDisabled();
  await dialog.getByLabel("正の余剰の単位数 K", { exact: true }).fill("8");
  await expect(preview).toContainText("95 円");
  await dialog
    .getByLabel("Commission（円／1単位・1人）", { exact: true })
    .fill("3");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toBeHidden();
  await open.click();
  await dialog.getByRole("button", { name: /供需条件.*変更/ }).click();
  await expect(
    dialog.getByRole("heading", {
      name: "CDA：カスタムのプレビュー",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toHaveValue("95");
  await expect(
    dialog.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toBeEnabled();
  await expect(
    dialog.getByLabel("Commission（円／1単位・1人）", { exact: true }),
  ).toHaveValue("3");
  await expect(save).toHaveCount(1);
  await dialog.getByLabel("均衡価格 p（円）", { exact: true }).fill("99");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
  await open.click();
  await dialog.getByRole("button", { name: /供需条件.*変更/ }).click();
  await expect(
    dialog.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toHaveValue("95");
});

test("market roster buttons expand and collapse each market independently", async ({
  page,
}) => {
  await page.goto("/demo");
  await enterTeacherPage(page);
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  await page.getByRole("button", { name: "確定して次へ", exact: true }).click();
  await page.getByLabel("市場数", { exact: true }).fill("2");
  const markets = page.locator(".study-roster-room");
  await expect(markets).toHaveCount(2);
  const first = markets.nth(0);
  const second = markets.nth(1);
  const firstToggle = first.locator(".study-roster-market-toggle");
  const secondToggle = second.locator(".study-roster-market-toggle");
  const firstTable = first.locator("table");
  const secondTable = second.locator("table");
  for (const market of [first, second]) {
    await expect(market.locator(".study-roster-market-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(market.locator("table")).toBeHidden();
  }
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-expanded", "true");
  await expect(firstTable).toBeVisible();
  await expect(firstTable.getByRole("row")).toHaveCount(5);
  await expect(secondToggle).toHaveAttribute("aria-expanded", "false");
  await expect(secondTable).toBeHidden();
  await secondToggle.click();
  await expect(firstTable).toBeVisible();
  await expect(secondToggle).toHaveAttribute("aria-expanded", "true");
  await expect(secondTable).toBeVisible();
  await firstToggle.click();
  await expect(firstToggle).toHaveAttribute("aria-expanded", "false");
  await expect(firstTable).toBeHidden();
  await expect(secondToggle).toHaveAttribute("aria-expanded", "true");
  await expect(secondTable).toBeVisible();
});

test("Custom keeps its candidate and manual parameters without automatically changing prices", async ({
  page,
}) => {
  await page.goto("/teacher?experiment=institutions");
  await enterTeacherPage(page);
  const open = page.getByRole("button", {
    name: "作成前に詳細を設定",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "実験の詳細設定",
    exact: true,
  });
  const next = dialog.getByRole("button", {
    name: "確定して次へ",
    exact: true,
  });
  await next.click();
  await dialog
    .getByRole("combobox", { name: "市場数・人数", exact: true })
    .selectOption("custom");
  await dialog
    .getByRole("spinbutton", { name: "予定人数", exact: true })
    .fill("100");
  await dialog
    .getByRole("spinbutton", { name: "市場数", exact: true })
    .fill("1");
  await next.click();
  const preset = dialog.getByRole("combobox", {
    name: "供需プリセット",
    exact: true,
  });
  const price = dialog.getByLabel("均衡価格 p（円）", { exact: true });
  const units = dialog.getByLabel("CDAの1人あたりの単位数", { exact: true });
  const save = dialog.getByRole("button", {
    name: "設定を保存して閉じる",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await preset.selectOption("overlap");
  await expect(price).toHaveValue("80");
  await expect(dialog.getByRole("alert")).toContainText("D(32)＝0円");
  await expect(save).toBeDisabled();
  await units.fill("3");
  await expect(price).toHaveValue("80");
  await expect(save).toBeDisabled();
  await price.fill("600");
  await units.fill("4");
  await expect(price).toHaveValue("600");
  await expect(dialog.getByRole("alert")).toContainText(
    "下限1円を下回っています",
  );
  await expect(save).toBeDisabled();
  await price.fill("800");
  await save.click();
  await expect(dialog).toBeHidden();
  await open.click();
  await dialog.getByRole("button", { name: /供需条件.*変更/ }).click();
  await expect(price).toHaveValue("800");
  await expect(units).toHaveValue("4");
  await preset.selectOption("existing");
  await expect(
    dialog.getByRole("heading", {
      name: "CDA：Defaultのプレビュー",
      exact: true,
    }),
  ).toBeVisible();
  await preset.selectOption("overlap");
  await expect(price).toHaveValue("80");
  await expect(save).toBeDisabled();
});

test("demo carries saved dialog settings into the same compact room controls", async ({
  page,
}) => {
  await page.goto("/demo");
  await enterTeacherPage(page);
  const open = page.getByRole("button", {
    name: "作成前に詳細を設定",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "実験の詳細設定",
    exact: true,
  });
  await dialog.getByLabel("CDAの期数", { exact: true }).fill("3");
  await dialog
    .getByLabel("CDA：1期の取引時間（秒）", { exact: true })
    .fill("90");
  await dialog
    .getByRole("checkbox", { name: "Call Market", exact: true })
    .uncheck();
  await dialog
    .getByRole("checkbox", { name: "Posted Offer", exact: true })
    .uncheck();
  await expect(
    dialog.getByLabel("Call Marketの期数", { exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByLabel("Posted Offer：売り手の価格提示（秒）", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Call Marketの1人あたりの単位数", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "設定を保存して閉じる", exact: true })
    .click();
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  const setup = page.getByRole("region", { name: "実験の準備", exact: true });
  await expect(
    setup.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("入室締切");
  await setup.getByRole("button", { name: /市場・取引条件.*変更/ }).click();
  const preset = setup.getByRole("region", {
    name: "供需プリセット",
    exact: true,
  });
  await expect(
    preset.getByRole("combobox", { name: "供需プリセット", exact: true }),
  ).toHaveValue("existing");
  await expect(
    preset.getByRole("button", { name: "この条件を確認して適用", exact: true }),
  ).toHaveCount(0);
  const saveConditions = preset.getByRole("button", {
    name: "確定して次へ",
    exact: true,
  });
  await expect(saveConditions).toHaveCount(1);
  await preset.getByLabel("CDAの1人あたりの単位数", { exact: true }).fill("");
  await expect(saveConditions).toBeDisabled();
  await preset.getByLabel("CDAの1人あたりの単位数", { exact: true }).fill("3");
  await preset
    .getByLabel("Commission（円／1単位・1人）", { exact: true })
    .fill("999");
  await expect(saveConditions).toBeDisabled();
  await preset
    .getByLabel("Commission（円／1単位・1人）", { exact: true })
    .fill("2");
  await saveConditions.click();
  await expect(
    setup.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("入室締切");
  await setup.getByRole("button", { name: /市場・取引条件.*変更/ }).click();
  await expect(
    preset.getByLabel("CDAの1人あたりの単位数", { exact: true }),
  ).toHaveValue("3");
  await expect(
    preset.getByLabel("Commission（円／1単位・1人）", { exact: true }),
  ).toHaveValue("2");
  await saveConditions.click();
  await expect(
    page.getByRole("region", { name: /^学生の割り当て/ }),
  ).toBeVisible();
  await expect(page.locator(".study-roster-market-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await setup.getByRole("button", { name: /制度と進行.*変更/ }).click();
  await expect(setup.getByLabel("CDAの期数", { exact: true })).toHaveValue("3");
  await expect(
    setup.getByLabel("CDA：1期の取引時間（秒）", { exact: true }),
  ).toHaveValue("90");
  await setup
    .getByRole("button", { name: "確定して次へ", exact: true })
    .click();
  await expect(
    setup.locator('.study-setup-step-toggle[aria-expanded="true"]'),
  ).toContainText("入室締切");
});

test("Double Auction setup only offers room creation", async ({ page }) => {
  await page.goto("/teacher?experiment=institutions");
  await enterTeacherPage(page);
  for (const path of [
    "/teacher?experiment=institutions",
    "/teacher?legacy=1",
    "/demo",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "ルーム作成" }),
    ).toBeVisible();
    await expect(
      page.getByText("教員として再入室", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("ルーム管理", { exact: true })).toHaveCount(0);
  }
});

test("shared preparation flow validates, advances, closes admission and preserves earlier settings", async ({
  page,
}) => {
  await page.goto("/demo");
  await enterTeacherPage(page);
  await page.getByRole("button", { name: "ルーム作成", exact: true }).click();
  const expanded = page.locator(
    '.study-setup-step-toggle[aria-expanded="true"]',
  );
  const next = page.getByRole("button", { name: "確定して次へ", exact: true });
  await expect(expanded).toHaveCount(1);
  await expect(expanded).toContainText("制度と進行");
  await page.getByLabel("CDAの期数", { exact: true }).fill("0");
  await expect(next).toBeDisabled();
  await page.getByLabel("CDAの期数", { exact: true }).fill("3");
  await page
    .getByLabel("Call Market：1回の注文受付（秒）", { exact: true })
    .fill("5");
  await next.click();
  await expect(expanded).toHaveCount(1);
  await expect(expanded).toContainText("市場・取引条件");
  await page.getByLabel("市場数", { exact: true }).fill("3");
  await expect(page.locator(".study-roster-room")).toHaveCount(3);
  await expect(
    page.getByRole("heading", {
      name: "CDA：Defaultのプレビュー",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Commission（円／1単位・1人）", { exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "供需条件・Commissionを変更",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "供需プリセット", exact: true })
    .selectOption("overlap");
  await page.getByLabel("均衡価格 p（円）", { exact: true }).fill("95");
  const cdaUnits = page.getByLabel("CDAの1人あたりの単位数", { exact: true });
  await cdaUnits.fill("");
  await expect(page.locator(".study-condition-summary")).toBeHidden();
  await expect(next).toBeDisabled();
  await cdaUnits.fill("3");
  await expect(
    page.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toHaveValue("95");
  await expect(page.locator(".study-condition-summary").first()).toContainText(
    "95 円",
  );
  await expect(
    page.getByRole("table", {
      name: "全単位の数値（片側24単位）",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Commission（円／1単位・1人）", { exact: true })
    .fill("2");
  await page.getByLabel("正の余剰の単位数 K", { exact: true }).fill("99");
  await expect(next).toBeDisabled();
  await page.getByLabel("正の余剰の単位数 K", { exact: true }).fill("4");
  await page.getByLabel("横向き重なりの長さ L", { exact: true }).fill("2");
  await page.getByLabel("均衡価格 p（円）", { exact: true }).fill("120");
  await page.getByLabel("階段の価格差 d（円）", { exact: true }).fill("6");
  await expect(next).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "この条件を確認して適用", exact: true }),
  ).toHaveCount(0);
  await next.click();
  await expect(expanded).toContainText("入室締切");
  await page.getByRole("button", { name: /市場・取引条件.*変更/ }).click();
  await expect(
    page.getByLabel("均衡価格 p（円）", { exact: true }),
  ).toHaveValue("120");
  await expect(cdaUnits).toHaveValue("3");
  await expect(
    page.getByLabel("Commission（円／1単位・1人）", { exact: true }),
  ).toHaveValue("2");
  await next.click();
  await page
    .getByRole("spinbutton", { name: "入室受付時間（秒）", exact: true })
    .fill("5");
  await page
    .getByRole("button", { name: "締切タイマーを開始", exact: true })
    .click();
  await expect(page.getByRole("timer")).toHaveAttribute(
    "aria-label",
    "入室締切まで",
  );
  await expect(expanded).toContainText("割り当て確認", { timeout: 15_000 });
  await expect(expanded).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "実験を開始", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: /制度と進行.*変更/ }).click();
  await expect(page.getByLabel("CDAの期数", { exact: true })).toHaveValue("3");
  await expect(
    page.getByLabel("Call Market：1回の注文受付（秒）", { exact: true }),
  ).toHaveValue("5");
  await page.getByLabel("CDAの期数", { exact: true }).fill("4");
  await next.click();
  await expect(expanded).toContainText("割り当て確認");
  await expect(page.locator(".study-setup-summary")).toContainText("3市場");
  await expect(page.locator(".study-setup-summary")).toContainText("CDA 4期");
  await page.getByRole("button", { name: /入室締切.*変更/ }).click();
  await expect(expanded).toContainText("入室締切");
  await page
    .getByRole("button", { name: "割り当て確認へ", exact: true })
    .click();
  await page.getByRole("button", { name: "実験を開始", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "全市場を一時停止", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "実験の準備", exact: true }),
  ).toBeHidden();
});
