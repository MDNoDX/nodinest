import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES = [
  "/",
  "/plans",
  "/plans?tab=goals",
  "/plans?tab=plans",
  "/library",
  "/library/new",
  "/notes",
  "/collections",
  "/write",
  "/review",
  "/assistant",
  "/media",
  "/chats",
  "/stats",
  "/stats?tab=plans",
  "/suggestions",
  "/notifications",
  "/settings",
  "/settings?tab=security",
  "/settings?tab=notifications",
  "/settings?tab=app",
  "/premium",
  "/guide",
];

test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true });

test("every page fits a phone: nothing runs off the side", async ({ page }) => {
  await signIn(page, {
    email: "phone@example.test",
    password: "Abcdefg12345",
    name: "Telefon Sinov",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const wide: string[] = [];
  for (const path of PAGES) {
    await page.goto(path);
    await page.locator("main").first().waitFor();
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth <= w + 1) return null;
      const el = [...document.querySelectorAll("main *")].find(
        (e) => e.getBoundingClientRect().right > w + 1 && !e.closest(".overflow-x-auto"),
      );
      return `${document.documentElement.scrollWidth}px, ${el?.tagName}.${String(el?.className).slice(0, 60)}`;
    });
    if (over) wide.push(`${path}: ${over}`);
  }
  expect(wide).toEqual([]);
  expect(errors).toEqual([]);
});

test("the sign-in page fits a phone and has no e-mail code box", async ({ page }) => {
  await page.goto("/login");
  await page.locator("[data-hydrated=true]").waitFor();
  await expect(page.getByPlaceholder("email@example.com")).toHaveCount(0);
  await page.getByRole("button", { name: "Parolni unutdingizmi?" }).click();
  await page.getByRole("textbox").first().fill("hech.kim@example.test");
  await page.getByRole("button", { name: "Kod yuboriş" }).click();
  await expect(page.getByText(/he\*\*\*m@example\.test/)).toBeVisible();
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
});
