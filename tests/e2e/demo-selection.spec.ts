import { expect, test } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";
import { expectEndButton } from "./helpers/end-experiment";

const demos = [
  {
    title: "Double Auction",
    url: /\/demo$/,
    heading: "DEMOモード · 教員の実験設定",
  },
  {
    title: "Efficient Market Hypothesis",
    url: /\/emh\/demo$/,
    heading: "EMH · 資産市場実験",
  },
  {
    title: "Judgement under Uncertainty",
    url: /\/judgment\/demo$/,
    heading: "Judgement under Uncertainty",
  },
  {
    title: "Stochastic Evolutionary Games",
    url: /\/evolution\/demo$/,
    heading: "確率的進化ゲーム",
  },
];

test("demo brands return to the experiment selection from every view", async ({
  page,
}) => {
  const brand = () =>
    page.getByRole("link", { name: "市場実験室 デモの実験選択" });
  const returnsToSelection = async () => {
    await expect(brand()).toHaveAttribute("href", "/demo/select");
    await brand().click();
    await expect(page).toHaveURL(/\/demo\/select$/);
  };

  await page.goto("/teacher");
  await enterTeacherPage(page);
  await page.goto("/");
  await expect(page.locator("header .brand")).toHaveAttribute("href", "/");
  await page.goto("/demo/select");
  await returnsToSelection();
  for (const path of [
    "/demo",
    "/emh/demo",
    "/judgment/demo",
    "/evolution/demo",
  ]) {
    await page.goto(path);
    await returnsToSelection();
  }

  for (const [path, create] of [
    ["/demo", "ルーム作成"],
    ["/emh/demo", "デモルームを作成"],
  ]) {
    for (const view of ["teacher", "student"]) {
      await page.goto(path);
      await page.getByRole("button", { name: create, exact: true }).click();
      if (view === "student") {
        await page.getByRole("button", { name: "学生画面を見る" }).click();
      }
      await returnsToSelection();
    }
  }

  await page.goto("/judgment/demo");
  await page.getByRole("button", { name: "すべて選択" }).click();
  await page.getByRole("button", { name: "デモを開始" }).click();
  const dialog = page.getByRole("dialog", { name: "DEMOモード" });
  await dialog.getByRole("link", { name: "市場実験室 デモの実験選択" }).click();
  await expect(page).toHaveURL(/\/demo\/select$/);

  for (const path of ["/demo/preview", "/emh/demo/preview"]) {
    await page.goto(path);
    await returnsToSelection();
    await page.goto(path);
    const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
    await frame
      .getByRole("link", { name: "市場実験室 デモの実験選択" })
      .click();
    await expect(page).toHaveURL(/\/demo\/select$/);
  }
});

test("student home omits demo while the teacher hub links to the shared selection", async ({
  page,
}, info) => {
  await page.goto("/");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole("link", { name: "Demo Model", exact: true }),
  ).toHaveCount(0);
  await page.goto("/teacher");
  await enterTeacherPage(page);
  await page.getByRole("link", { name: "Demo Model", exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/select$/);
  await expect(
    page.getByRole("heading", { name: "デモする実験を選ぶ" }),
  ).toBeVisible();
  for (const width of [1431, 768, 641, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const titles = page.locator(".demo-experiment-grid h2");
    await expect(titles).toHaveCount(4);
    expect(
      await titles.evaluateAll((els) =>
        els.every((el) => el.scrollWidth <= el.clientWidth + 1),
      ),
    ).toBe(true);
    if (width === 1431 || width === 320)
      await page.screenshot({
        path: info.outputPath(`demo-cards-${width}.png`),
      });
  }
  await expect(page.getByText("デモを開く", { exact: true })).toHaveCount(0);
  for (const demo of demos) {
    await page.getByRole("link", { name: new RegExp(demo.title) }).click();
    await expect(page).toHaveURL(demo.url);
    await expect(
      page.getByRole("heading", { name: demo.heading, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
  }
  await page.goto("/teacher");
  await enterTeacherPage(page);
  await expect(
    page.getByRole("link", { name: "Demo Model", exact: true }),
  ).toHaveAttribute("href", "/demo/select");
  await expect(
    page.getByRole("link", { name: "戻る", exact: true }),
  ).toHaveCount(0);
  for (const experiment of ["institutions", "emh", "judgment", "evolution"]) {
    await page.goto(`/teacher?experiment=${experiment}`);
    await expect(
      page.getByRole("link", { name: "戻る", exact: true }),
    ).toHaveAttribute("href", "/teacher");
    await page.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/teacher$/);
    await page.goto(`/teacher?experiment=${experiment}`);
    await expect(
      page.getByRole("link", { name: "Demo Model", exact: true }),
    ).toHaveCount(0);
  }
});

test("demo mode labels and entry colors are consistent across experiments", async ({
  page,
}) => {
  await page.goto("/teacher");
  await enterTeacherPage(page);
  const formalAccent = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--formal-accent")
      .trim(),
  );
  const colors = await page
    .getByRole("link", { name: "Demo Model" })
    .evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
  const assertBadge = async (selector: string, label: string) => {
    const badge = page.locator(selector);
    await expect(badge).toHaveText(label);
    await expect(badge).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(badge).toHaveCSS("color", colors.background);
  };
  await page.goto("/demo/select");
  await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
  await expect(
    page.getByRole("link", { name: "DEMOモードを終了" }),
  ).toHaveAttribute("href", "/teacher");
  await expect(page.getByRole("link", { name: "DEMOモードを終了" })).toHaveCSS(
    "background-color",
    "rgb(84, 86, 199)",
  );
  expect(formalAccent).toBe("#5456c7");
  expect(colors.background).toBe("rgb(244, 203, 81)");
  for (const [path, create, teacherHref] of [
    ["/demo", "ルーム作成", "/teacher?experiment=institutions"],
    ["/emh/demo", "デモルームを作成", "/teacher?experiment=emh"],
    ["/evolution/demo", "デモルームを作成", "/teacher?experiment=evolution"],
  ]) {
    await page.goto(path);
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
    await expect(
      page.getByRole("link", { name: "DEMOモードを終了" }),
    ).toHaveAttribute("href", teacherHref);
    await expect(
      page.getByRole("link", { name: "教員用ページへ" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: create, exact: true }),
    ).toHaveCSS("background-color", colors.background);
    await page.getByRole("button", { name: create, exact: true }).click();
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
    await page.getByRole("button", { name: "学生画面を見る" }).click();
    if (path === "/emh/demo") {
      await expect(
        page.getByRole("link", { name: "教員用ページへ" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "教員画面を見る" }).click();
      await expect(
        page.getByRole("link", { name: "教員用ページへ" }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "学生画面を見る" }).click();
    }
    await assertBadge("header .header-left .demo-header-tag", "DEMOモード");
  }
  await page.goto("/judgment/demo");
  await assertBadge("header .demo-header-tag", "DEMOモード");
  await page.getByRole("button", { name: "すべて選択" }).click();
  await page.getByRole("button", { name: "デモを開始" }).click();
  await expect(page.getByRole("dialog", { name: "DEMOモード" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "DEMOモード",
  );
  await expect(page.locator(".judgment-preview .student-progress")).toHaveCSS(
    "background-color",
    colors.background,
  );
  await (await expectEndButton(page)).click();
  await page.getByRole("button", { name: "終了する", exact: true }).click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("en");
  await assertBadge("header .demo-header-tag", "Demo mode");
  await page.getByRole("button", { name: "Start demo" }).click();
  await expect(page.getByRole("dialog", { name: "Demo mode" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "Demo mode",
  );
  await page
    .getByRole("button", { name: "End experiment", exact: true })
    .click();
  await page.getByRole("button", { name: "End run", exact: true }).click();
  await page
    .getByRole("combobox", { name: "言語 / 语言 / Language" })
    .selectOption("zh");
  await assertBadge("header .demo-header-tag", "演示模式");
  await page.getByRole("button", { name: "开始 Demo" }).click();
  await expect(page.getByRole("dialog", { name: "演示模式" })).toBeVisible();
  await assertBadge(
    ".judgment-preview header .header-left .demo-header-tag",
    "演示模式",
  );
});

test("demo exit uses the formal color and returns to teacher setup", async ({
  page,
}) => {
  for (const [path, teacherHref] of [
    ["/demo/select", "/teacher"],
    ["/demo", "/teacher?experiment=institutions"],
    ["/emh/demo", "/teacher?experiment=emh"],
    ["/judgment/demo", "/teacher?experiment=judgment"],
    ["/evolution/demo", "/teacher?experiment=evolution"],
    ["/demo/preview", "/teacher?experiment=institutions"],
    ["/emh/demo/preview", "/teacher?experiment=emh"],
  ]) {
    await page.goto(path);
    await enterTeacherPage(page);
    const exit = page.getByRole("link", {
      name: "DEMOモードを終了",
      exact: true,
    });
    await expect(exit).toHaveCSS("background-color", "rgb(84, 86, 199)");
    await expect(exit).toHaveAttribute("href", teacherHref);
    await expect(
      page.getByRole("link", { name: "教員用ページへ" }),
    ).toHaveCount(0);
    await exit.click();
    await expect(page).toHaveURL(new URL(teacherHref, page.url()).href);
  }
});

for (const [path, teacherHref] of [
  ["/demo/preview", "/teacher?experiment=institutions"],
  ["/emh/demo/preview", "/teacher?experiment=emh"],
]) {
  test(`demo selection navigates the whole page from ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await enterTeacherPage(page);
    await expect(
      page.getByRole("link", { name: "DEMOモードを終了" }),
    ).toHaveAttribute("href", teacherHref);
    const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
    await frame.getByRole("link", { name: "戻る", exact: true }).click();
    await expect(page).toHaveURL(/\/demo\/select$/);
    await expect(
      page.getByRole("heading", { name: "デモする実験を選ぶ" }),
    ).toBeVisible();
  });

  test(`demo exit navigates the whole page from the preview frame at ${path}`, async ({
    page,
  }) => {
    await page.goto(path);
    await enterTeacherPage(page);
    const frame = page.frameLocator('iframe[title="操作できるひとりデモ"]');
    const exit = frame.getByRole("link", { name: "DEMOモードを終了" });
    await expect(exit).toHaveAttribute("href", teacherHref);
    await exit.click();
    await expect(page).toHaveURL(new URL(teacherHref, page.url()).href);
  });
}

test("demo exit returns to teacher setup from live experiment views", async ({
  page,
}) => {
  for (const [path, create, teacherHref] of [
    ["/demo", "ルーム作成", "/teacher?experiment=institutions"],
    ["/emh/demo", "デモルームを作成", "/teacher?experiment=emh"],
  ]) {
    for (const view of ["teacher", "student"]) {
      await page.goto(path);
      await enterTeacherPage(page);
      await page.getByRole("button", { name: create, exact: true }).click();
      if (view === "student")
        await page.getByRole("button", { name: "学生画面を見る" }).click();
      await expect(
        page.getByRole("link", { name: "教員用ページへ" }),
      ).toHaveCount(0);
      await page.getByRole("link", { name: "DEMOモードを終了" }).click();
      await expect(page).toHaveURL(new URL(teacherHref, page.url()).href);
    }
  }

  await page.goto("/judgment/demo");
  await page.getByRole("button", { name: "すべて選択" }).click();
  await page.getByRole("button", { name: "デモを開始" }).click();
  await page
    .getByRole("dialog", { name: "DEMOモード" })
    .getByRole("link", { name: "DEMOモードを終了" })
    .click();
  await expect(page).toHaveURL(
    new URL("/teacher?experiment=judgment", page.url()).href,
  );
});
