import { expect, test } from "@playwright/test";
import { DEV_USER, DEV_USER_B } from "./fixtures";
import { makeSuperadmin, signIn, signUp } from "./helpers";

test.describe.configure({ mode: "serial" });

test("unauthenticated users are sent to login", async ({ page }) => {
  await page.goto("/library");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: /NodiNest/ })).toBeVisible();
});

test("sign up, Uzbek by default, switch to English, theme persists", async ({ page }) => {
  await signUp(page, DEV_USER);
  await expect(
    page
      .getByRole("navigation", { name: "Asosiy navigatsiya" })
      .getByRole("link", { name: "Kutubxona" }),
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
  await page.getByRole("radio", { name: "O‘zbekcha" }).click();
  await expect(page.getByRole("heading", { name: "Sozlamalar" })).toBeVisible();
});

test("catalog: person + resource with author autocomplete, quote, search", async ({ page }) => {
  await makeSuperadmin(DEV_USER.email);
  await signIn(page, DEV_USER);

  await page.goto("/people/new");
  await page.getByLabel("To‘liq ism").fill("Alisher Navoiy");
  await page.getByLabel(/Tug‘ilgan sana/).fill("1441-02-09");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("heading", { name: "Alisher Navoiy" })).toBeVisible();

  await page.goto("/library/new");
  await page.getByLabel("Sarlavha", { exact: true }).fill("Xamsa");
  const combo = page.getByRole("combobox", { name: "Shaxs qo‘shish" });
  await combo.fill("n");
  await expect(page.getByRole("option", { name: /Alisher Navoiy/ })).toBeVisible();
  await combo.press("Enter");
  await page.getByText("Adabiyot", { exact: true }).click();
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("heading", { name: "Xamsa", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Alisher Navoiy" })).toBeVisible();

  await page.getByRole("link", { name: "Iqtibos qo‘shish" }).click();
  await page.getByLabel("Aynan iqtibos").fill("Ilm — nur, jaholat — zulmat.");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("“Ilm — nur, jaholat — zulmat.”")).toBeVisible();

  await page.goto("/search?q=jaholat");
  await expect(page.getByRole("heading", { name: /Iqtiboslar/ })).toBeVisible();
  await page.goto("/search?q=xams");
  await expect(page.getByRole("link", { name: /Xamsa/ }).first()).toBeVisible();
});

test("study timer: start, pause, resume, finish", async ({ page }) => {
  await signIn(page, DEV_USER);
  await page.goto("/journal");
  await page.getByRole("button", { name: "Boshlash" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "To‘xtatish" }).first().click();
  await expect(page.getByRole("button", { name: "Davom ettirish" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Davom ettirish" }).first().click();
  await page.getByRole("button", { name: "Yakunlash" }).last().click();
  await expect(page.getByText(/Sessiya yakunlandi/)).toBeVisible();
  await expect(page.getByText("Faol sessiya yo‘q.")).toBeVisible();
});

test("privacy: another user cannot open a private note by URL", async ({ page, browser }) => {
  await signIn(page, DEV_USER);
  await page.goto("/notes/new");
  await page.getByLabel("Sarlavha").fill("Maxfiy fikr");
  await page.getByLabel("Qayd", { exact: true }).fill("Faqat menga ko‘rinadi");
  await page.getByRole("button", { name: "Saqlash" }).click();
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
