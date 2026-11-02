import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("a plan item: clear units, time by pressing, a reason only when wanted", async ({ page }) => {
  await signIn(page, { email: "plans@example.test", password: "Abcdefg12345", name: "Reja Sinov" });
  await page.goto("/plans");
  await page.getByRole("button", { name: "Qöşiş", exact: true }).first().click();
  await page.getByLabel("Nomi").fill("Bomdod namozi");

  const unit = page.getByLabel("Ölçov");
  await expect(unit).toHaveValue("none");
  const options = await unit.locator("option").allTextContents();
  expect(options).toEqual(["–", "sahifa", "daqiqa", "soat", "ta", "rakat", "bob", "töliq"]);
  await unit.selectOption("rakat");
  await page.getByLabel("Qançaligi").fill("4");

  // 24 hours, typed key by key: "17" stays 17 (never 01), then the minutes.
  await page.getByRole("button", { name: "--:--" }).first().click();
  await page.getByLabel("Soat", { exact: true }).first().pressSequentially("17");
  await page.getByLabel("Daqiqa", { exact: true }).first().pressSequentially("43");
  await page.getByRole("button", { name: "Tayyor" }).click();
  await expect(page.getByRole("button", { name: "17:43" })).toBeVisible();
  // A single digit that cannot start an hour moves on at once: 5 → 05.
  await page.getByRole("button", { name: "17:43" }).click();
  await page.getByLabel("Soat", { exact: true }).first().pressSequentially("5");
  await page.getByLabel("Daqiqa", { exact: true }).first().pressSequentially("30");
  await page.getByRole("button", { name: "Tayyor" }).click();
  await expect(page.getByRole("button", { name: "05:30" })).toBeVisible();

  await page.getByRole("button", { name: "Saqlaş" }).click();
  const row = page.locator(".plan-row", { hasText: "Bomdod namozi" });
  await expect(row).toContainText("4 rakat");
  await expect(row).toContainText("05:30");
  await expect(row.locator("img")).toHaveAttribute("src", "/plan-icons/mosque.svg");

  // The reason stays out of the way until "not done" is pressed.
  await row.getByText("Bomdod namozi").click();
  await expect(row.getByPlaceholder("Sababi (ixtiyoriy)")).toHaveCount(0);
  await row.getByRole("button", { name: "Bajarilmadi" }).click();
  await expect(row.getByPlaceholder("Sababi (ixtiyoriy)")).toBeVisible();
});
