import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";
import { signIn } from "./helpers";

test("two people write to each other; the reply arrives by itself, read marks follow", async ({
  page,
  browser,
}) => {
  const a = { email: "chat-a@example.test", password: "Abcdefg12345", name: "Yozuvçi Bir" };
  const b = { email: "chat-b@example.test", password: "Abcdefg12345", name: "Javobçi Ikki" };
  await signIn(page, a);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, b);
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  const [ub] = await sql`select username from nodinest."user" where email = ${b.email}`;
  await sql.end();

  // A finds B in the chat search and starts a conversation.
  await page.goto("/chats");
  await page.getByPlaceholder("Ism, @username yoki xabar").fill(ub.username);
  await page.getByRole("button", { name: new RegExp(b.name) }).click();
  await expect(page).toHaveURL(/\/chats\/[0-9a-f-]{36}$/);
  const box = page.getByLabel("Xabar yozing…");
  await box.fill("Salom, kitob qalay?");
  await box.press("Enter");
  await expect(page.getByText("Salom, kitob qalay?")).toBeVisible();

  // B sees it in the list with a badge, opens it and answers.
  await other.goto("/chats");
  const row = other.getByRole("link", { name: new RegExp(a.name) });
  await expect(row).toContainText("Salom, kitob qalay?");
  await row.click();
  await expect(other.getByText("Salom, kitob qalay?")).toBeVisible();
  await other.getByLabel("Xabar yozing…").fill("Zör, rahmat!");
  await other.getByLabel("Xabar yozing…").press("Enter");

  // A gets the answer without reloading, and the message shows as read.
  await expect(page.getByText("Zör, rahmat!")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Öqildi").first()).toBeVisible();
  await ctx.close();
});
