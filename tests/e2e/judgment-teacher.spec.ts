import { expect, test } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";
import { expectEndButton } from "./helpers/end-experiment";
import type {
  StudentView,
  TeacherView,
} from "../../src/experiments/judgment/types";

test("Judgment task cards, translated details and demo controls stay usable across layouts", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/judgment/demo");
  await enterTeacherPage(page);
  const language = page.getByRole("combobox", {
    name: "言語 / 语言 / Language",
    exact: true,
  });
  const start = page.getByRole("button", { name: "デモを開始", exact: true });
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "すべて選択", exact: true }).click();
  await expect(
    page.locator(".judgment-control-panel").getByRole("status"),
  ).toHaveText("14課題を選択");
  await expect(
    page.locator(".judgment-study-option input:checked"),
  ).toHaveCount(14);
  await page
    .getByLabel("課題の順番を学生ごとにランダム化", { exact: true })
    .check();
  await page.getByLabel("選択肢の順番をランダム化", { exact: true }).check();
  for (const [locale, count, close] of [
    ["zh", "已选 14 项", "关闭"],
    ["en", "14 tasks selected", "Close"],
    ["ja", "14課題を選択", "閉じる"],
  ]) {
    await language.selectOption(locale);
    await expect(
      page.locator(".judgment-control-panel").getByRole("status"),
    ).toHaveText(count);
    await page.locator(".judgment-study-info").first().click();
    const dialog = page.locator(".judgment-study-dialog[open]");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(
      await page.locator(".judgment-study-title strong").first().innerText(),
    );
    await dialog.getByRole("button", { name: close, exact: true }).click();
    await expect(
      page.locator(".judgment-study-option input:checked"),
    ).toHaveCount(14);
    await expect(
      page.locator(".judgment-randomization input:checked"),
    ).toHaveCount(2);
  }
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    if (width === 1440) {
      await page.evaluate(() => scrollTo(0, 400));
      const rect = await start.boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.y + rect!.height).toBeLessThan(960);
    } else {
      const panel = await page.locator(".judgment-control-panel").boundingBox();
      const cards = await page.locator(".judgment-settings").boundingBox();
      expect(panel!.y).toBeLessThan(cards!.y);
    }
    await page.screenshot({
      path: info.outputPath(`demo-${width}.png`),
      fullPage: true,
    });
  }
  await language.selectOption("en");
  await page.getByRole("button", { name: "Start demo", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "Demo mode", exact: true });
  await expect(preview.locator(".judgment-app")).toHaveAttribute("lang", "en");
  await expect(preview.locator(".student-progress")).toHaveText("1 / 86");
  await preview.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(preview.locator(".student-progress")).toHaveText("2 / 86");
  await preview
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(preview.locator(".student-progress")).toHaveText("1 / 86");
  await preview
    .getByRole("button", { name: "End experiment", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(preview.locator(".student-progress")).toHaveText("1 / 86");
  await preview
    .getByRole("button", { name: "End experiment", exact: true })
    .click();
  await page.getByRole("button", { name: "End run", exact: true }).click();
  await expect(
    page.locator(".judgment-study-option input:checked"),
  ).toHaveCount(14);
  await language.selectOption("en");
  await page.reload();
  await expect(language).toHaveValue("en");
  expect(errors).toEqual([]);
});

test("Judgment teacher workspace runs a lesson, locks settings, recovers and exports saved responses", async ({
  browser,
  page,
  baseURL,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/teacher?experiment=judgment");
  await enterTeacherPage(page);
  await page
    .locator('.judgment-study-option input[type="checkbox"]')
    .first()
    .check();
  await page
    .getByLabel("課題の順番を学生ごとにランダム化", { exact: true })
    .check();
  await page.getByLabel("選択肢の順番をランダム化", { exact: true }).check();
  await page
    .getByLabel("実験名", { exact: true })
    .fill("Judgment UI migration verification");
  await page
    .getByLabel("教員パスワード", { exact: false })
    .fill("Judgment-UI-check-only");
  await page.getByRole("button", { name: "ルームを作成", exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher$/);
  const code = new URL(page.url()).pathname.split("/").at(-1)!;
  const base = `/api/rooms/${code}`;
  const studentContext = await browser.newContext({ baseURL });
  try {
    const student = await studentContext.newPage();
    student.on("pageerror", (error) => errors.push(error.message));
    await student.goto(`/?code=${code}`);
    await student.locator('input[name="nickname"]').fill("0098701");
    await student.locator('input[name="pin"]').fill("2468");
    await student
      .getByRole("button", { name: "入室する", exact: true })
      .click();
    await expect(
      page.getByRole("cell", { name: "0098701", exact: true }),
    ).toBeVisible();
    await expect(student.locator(".student-waiting-card")).toBeVisible();
    await expect(student.locator(".student-waiting-card h1")).toHaveText(
      "開始をお待ちください。",
    );
    await student.locator("#language-select").selectOption("en");
    await expect(student.locator(".student-waiting-card h1")).toHaveText(
      "Please wait for the experiment to start.",
    );
    await student.locator("#language-select").selectOption("ja");
    await expect(student.locator("#logout")).toHaveClass(/button secondary/);
    for (const width of [1366, 390, 320]) {
      await student.setViewportSize({ width, height: 900 });
      expect(
        await student.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 1366)
        await student
          .locator(".student-waiting-card")
          .screenshot({ path: info.outputPath("judgment-waiting.png") });
    }

    await page.getByRole("button", { name: "実施を開始", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "実験を終了", exact: true }),
    ).toBeVisible();
    for (const input of await page
      .locator('.judgment-workspace input[type="checkbox"]')
      .all())
      await expect(input).toBeDisabled();
    // Locked settings still allow reading task details and previewing the actual lesson.
    await page.locator(".judgment-study-info").first().click();
    await page
      .locator(".judgment-study-dialog[open]")
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await page
      .getByRole("button", { name: "学生画面をプレビュー", exact: true })
      .click();
    await expect(
      page.locator(".judgment-preview .student-progress"),
    ).toBeVisible();
    await page
      .locator(".judgment-preview")
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "言語 / 语言 / Language", exact: true })
      .selectOption("en");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "End experiment", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".judgment-study-option input:checked"),
    ).toHaveCount(1);
    await expect(
      page.locator(".judgment-randomization input:checked"),
    ).toHaveCount(2);
    await page
      .getByRole("combobox", { name: "言語 / 语言 / Language", exact: true })
      .selectOption("ja");
    let answered = 0;
    for (let attempt = 0; attempt < 10; attempt++) {
      const state = (await (
        await studentContext.request.get(`${base}/judgment?session=student`)
      ).json()) as StudentView;
      if (state.run?.status === "completed") break;
      expect(state.run?.trial).toBeTruthy();
      await expect(student.locator("#answer-form")).toBeVisible();
      for (const field of state.run!.trial!.fields) {
        const inputs = student.locator(
          `#answer-form input[name="${field.id}"]`,
        );
        if (field.type === "choice") await inputs.first().check();
        else if (field.type === "number")
          await inputs.first().fill(String(field.min ?? 1));
      }
      const submitted = student.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/answers"),
      );
      await student.locator("#next").click();
      const response = await submitted;
      expect(response.status()).toBe(200);
      const after = await response.json();
      if (answered === 0) {
        const duplicate = await studentContext.request.post(response.url(), {
          data: response.request().postDataJSON(),
        });
        expect(duplicate.status()).toBe(200);
        expect(await duplicate.json()).toEqual(after);
        await student.reload();
      }
      answered++;
    }
    expect(answered).toBeGreaterThan(0);
    await expect(
      page.getByRole("row").filter({ hasText: "0098701" }),
    ).toContainText("完了");
    const view = (await (
      await page.request.get(`${base}/judgment?session=teacher`)
    ).json()) as TeacherView;
    expect(view.students[0].answered).toBe(view.students[0].totalTrials);
    expect(view.lesson!.settings.randomizeExperiments).toBe(true);
    expect(view.lesson!.settings.randomizeChoices).toBe(true);
    await expectEndButton(page);
    await page.screenshot({
      path: info.outputPath("teacher-completed.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "実験を終了", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "戻る", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "実験を終了", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "実験を終了", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "終了する", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "次の実施を開始", exact: true }),
    ).toBeEnabled();
    for (const format of ["csv", "json"]) {
      const downloadEvent = page.waitForEvent("download");
      await page.locator(`a[href*="export?format=${format}"]`).click();
      const download = await downloadEvent;
      expect(await download.failure()).toBeNull();
      const body = await (
        await page.request.get(
          `${base}/judgment/export?format=${format}&session=teacher`,
        )
      ).text();
      expect(body).toContain("0098701");
    }
    await page
      .getByRole("button", { name: "次の実施を開始", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "実験を終了", exact: true }),
    ).toBeVisible();
    const next = (await (
      await page.request.get(`${base}/judgment?session=teacher`)
    ).json()) as TeacherView;
    expect(next.history).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally {
    await studentContext.close();
    const deleted = await page.request.delete(base, {
      data: { confirmed: true },
    });
    expect(deleted.status()).toBe(200);
  }
});
