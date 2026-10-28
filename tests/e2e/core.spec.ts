import { expect, test } from "@playwright/test";
import { DEV_USER, DEV_USER_B } from "./fixtures";
import { makeSuperadmin, signIn, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /kelibsiz/ })).toBeVisible();
});

test("sign up, Uzbek by default, switch to English, theme persists", async ({ page }) => {
  await signUp(page, DEV_USER);
  await expect(
    page
      .getByRole("navigation", { name: "Asosiy navigatsiya" })
      .getByRole("link", { name: "Darsxona" }),
  ).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  // back to Uzbek for the rest of the suite
  await page.getByRole("radio", { name: "Özbekça" }).click();
  await expect(page.getByRole("heading", { name: "Sozlamalar" })).toBeVisible();
});

test("catalog: person + resource with author autocomplete, quote, search", async ({ page }) => {
  await makeSuperadmin(DEV_USER.email);
  await signIn(page, DEV_USER);

  await page.goto("/people/new");
  await page.getByLabel("Töliq ism").fill("Alisher Navoiy");
  // Dates are year + optional month / day pickers.
  await page.getByRole("textbox", { name: "Yil" }).first().fill("1441");
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page.getByRole("heading", { name: "Alisher Navoiy" })).toBeVisible();

  await page.goto("/library/new");
  await page.getByLabel("Sarlavha", { exact: true }).fill("Xamsa");
  const combo = page.getByRole("combobox", { name: "Şaxs qöşiş" });
  await combo.fill("n");
  await expect(page.getByRole("option", { name: /Alisher Navoiy/ })).toBeVisible();
  await combo.press("Enter");
  await page.getByText("Adabiyot", { exact: true }).click();
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page.getByRole("heading", { name: "Xamsa", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alisher Navoiy" })).toBeVisible();

  await page.getByRole("button", { name: "Qöşiş", exact: true }).click();
  await page.getByRole("menuitem", { name: "Iqtibos qöşiş" }).click();
  await page.getByLabel("Aynan iqtibos").fill("Ilm — nur, jaholat — zulmat.");
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page.getByText("“Ilm — nur, jaholat — zulmat.”")).toBeVisible();

  await page.goto("/search?q=jaholat");
  await expect(page.getByRole("heading", { name: /Iqtiboslar/ })).toBeVisible();
  await page.goto("/search?q=xams");
  await expect(page.getByRole("link", { name: /Xamsa/ }).first()).toBeVisible();
});

test("taqriz: write and find inside it from the side panel", async ({ page }) => {
  await signIn(page, DEV_USER);
  await page.goto("/library?scope=all&q=Xamsa");
  await page.getByRole("link", { name: /Xamsa/ }).first().click();
  await page.getByRole("link", { name: "Taqriz" }).first().click();
  const doc = page.locator("main .ProseMirror");
  await doc.click();
  await page.keyboard.type("Ilm nur. Ilm yo‘l ko‘rsatadi.");
  await page.getByLabel("Taqrizdan qidiriş", { exact: true }).fill("ilm");
  await expect(page.getByText("1 / 2 topildi")).toBeVisible();
  await expect(page.locator(".nn-find")).toHaveCount(2);
});

test("Darsxona tabs and publishers & channels explain themselves", async ({ page }) => {
  await signIn(page, DEV_USER);
  await page.goto("/library");
  await page.getByRole("link", { name: "Naşriyot va kanallar" }).click();
  await expect(page).toHaveURL(/\/publishers/);
  await expect(page.getByText(/YouTube kanallari/)).toBeVisible();
  await page.getByRole("link", { name: "Şaxslar" }).click();
  await expect(page).toHaveURL(/\/people/);
});

test("takliflar: a message goes to the admin and shows as sent", async ({ page }) => {
  await signIn(page, DEV_USER);
  await page.goto("/suggestions");
  await expect(page.getByRole("link", { name: /@nodinest_bot/ })).toBeVisible();
  await page.getByLabel("Sarlavha").fill("Test taklif");
  await page.getByLabel("Matn").fill("Video uchun yangi imkoniyat");
  await page.getByRole("button", { name: "Yuboriş" }).click();
  await expect(page.getByText("Yuborildi — rahmat!")).toBeVisible();
  await expect(page.getByText("Test taklif")).toBeVisible();
});

test("Kitob yozish: a memoir starts from its template with chapters and a goal", async ({
  page,
}) => {
  await signIn(page, DEV_USER);
  await page.goto("/write");
  await page.getByRole("button", { name: /Hayotim haqida yozişni boşlaş/ }).click();
  await page.getByLabel(/Maqsad/).fill("30000");
  await page.getByRole("button", { name: /Yaratiş va yozişni boşlaş/ }).click();
  await expect(page).toHaveURL(/\/write\/[0-9a-f-]{36}/);
  await expect(page.getByText("Kitobim", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bolaligim" }).first()).toBeVisible();
  // Guiding prompts don't count, only the author's text (here: chapter titles).
  await expect(page.getByText(/^\d{1,2} \/ 30\s?000 söz$/)).toBeVisible();
});

test("privacy: another user cannot open a private note by URL", async ({ page, browser }) => {
  await signIn(page, DEV_USER);
  await page.goto("/notes/new");
  await page.getByLabel("Sarlavha").fill("Maxfiy fikr");
  await page.getByLabel("Qayd", { exact: true }).fill("Faqat menga ko‘rinadi");
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page.getByRole("heading", { name: "Maxfiy fikr" })).toBeVisible();
  const noteUrl = page.url();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other, DEV_USER_B);
  await other.goto(noteUrl);
  await expect(other.getByRole("heading", { name: "Sahifa topilmadi" })).toBeVisible();
  await other.goto("/search?q=maxfiy");
  await expect(other.getByText(/natija topilmadi/)).toBeVisible();
  // regular users don't see the admin area
  await other.goto("/admin");
  await expect(other).toHaveURL("/");
  await ctx.close();
});
