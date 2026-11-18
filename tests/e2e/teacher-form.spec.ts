import { expect, test, type Locator } from "@playwright/test";
import { enterTeacherPage } from "./helpers/teacher-login";

test("teacher form guidance is consistent across experiments and reentry", async ({
  page,
}) => {
  const expectedHelp = "再入室に使います。学生には共有しないでください。";
  let passwordStyle: { label: string; input: string; help: string } | undefined;
  const style = (locator: Locator) =>
    locator.evaluate((input) => {
      const label = input.closest("label");
      const help = label?.querySelector(".field-help");
      if (!label || !help) throw new Error("Missing field or help text");
      const measure = (element: Element) => {
        const css = getComputedStyle(element);
        return `${css.fontSize}/${css.fontWeight}`;
      };
      return {
        label: measure(label),
        input: measure(input),
        help: measure(help),
      };
    });

  for (const experiment of ["institutions", "emh", "judgment"]) {
    await page.goto(`/teacher?experiment=${experiment}`);
    await enterTeacherPage(page);
    const password = page.getByLabel("教員パスワード", { exact: false });
    await expect(password).toHaveAttribute("placeholder", "8文字以上で設定");
    await expect(page.getByText(expectedHelp, { exact: true })).toBeVisible();
    const currentPasswordStyle = await style(password);
    if (passwordStyle) expect(currentPasswordStyle).toEqual(passwordStyle);
    else passwordStyle = currentPasswordStyle;

    await expect(page.getByLabel("教員用キー", { exact: false })).toHaveCount(
      0,
    );
  }

  await page.goto("/teacher?code=");
  await expect(
    page.getByLabel("ルームコード", { exact: true }),
  ).toHaveAttribute("placeholder", "例：K7M4PX");
  const reentry = page.getByLabel("教員パスワード", { exact: false });
  await expect(reentry).toHaveAttribute(
    "placeholder",
    "作成時に設定したパスワード",
  );
  await expect(page.getByText(expectedHelp, { exact: true })).toBeVisible();
  expect(await style(reentry)).toEqual(passwordStyle);
});

test("teacher can create and reenter a room with an eight-digit password without a status request", async ({
  page,
  browser,
  baseURL,
}) => {
  // A separate configuration request must not leave this form disabled.
  await page.route("**/api/status", (route) => route.abort("failed"));
  await page.goto("/teacher?experiment=institutions");
  await enterTeacherPage(page);
  await page
    .getByLabel("実験名", { exact: true })
    .fill("教員フォームの動作確認");
  await page.getByLabel("教員パスワード", { exact: false }).fill("12345678");
  const create = page.getByRole("button", { name: "ルーム作成" });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(/\/room\/[A-Z2-9]{6}\?entry=teacher$/);
  await expect(
    page.getByRole("region", { name: "実験の準備", exact: true }),
  ).toBeVisible();
  const code = new URL(page.url()).pathname.split("/").at(-1)!;
  const response = await page.request.get(`/api/rooms/${code}`);
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  expect(snapshot.me.role).toBe("teacher");
  expect(snapshot.config.capacity).toBe(16);
  expect(snapshot.study.protocol).toBe("institutions-v1");
  await page.getByRole("link", { name: "ルーム管理", exact: true }).click();
  await expect(page).toHaveURL(`/teacher?room=${code}`);
  await expect(page.getByRole("heading", { name: "実験を選ぶ" })).toBeVisible();
  await page.getByRole("link", { name: `ルーム ${code} に戻る` }).click();
  await expect(page).toHaveURL(`/room/${code}?entry=teacher`);

  const returningTeacher = await browser.newContext({ baseURL });
  try {
    const reentry = await returningTeacher.newPage();
    await reentry.goto("/teacher");
    await enterTeacherPage(reentry);
    const management = reentry.getByRole("region", { name: "ルーム管理" });
    await management.getByRole("searchbox").fill(code);
    const card = management.getByRole("listitem");
    await expect(
      card.getByText("Double Auction", { exact: true }),
    ).toBeVisible();
    await card.getByRole("link", { name: /結果・ダウンロード/ }).click();
    await expect(reentry.getByLabel("ルームコード")).toHaveValue(code);
    await reentry
      .getByLabel("教員パスワード", { exact: false })
      .fill("12345678");
    await reentry.getByRole("button", { name: "管理画面に入る" }).click();
    await expect(reentry).toHaveURL(`/room/${code}?entry=teacher`);
    await expect(
      reentry.getByRole("region", { name: "実験の準備", exact: true }),
    ).toBeVisible();
  } finally {
    await returningTeacher.close();
  }
});
