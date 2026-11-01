import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";
import { signIn } from "./helpers";

test("someone's public entry opens for others; their notes do not", async ({ page, browser }) => {
  const owner = { email: "shows@example.test", password: "Abcdefg12345", name: "Ochiq Egasi" };
  await signIn(page, owner);
  await page.goto("/library/new");
  await page.getByLabel("Nomi", { exact: true }).fill("Ochiq darslik");
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}/);
  const id = /library\/([0-9a-f-]{36})/.exec(page.url())![1];
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  const [u] = await sql`select id, username from nodinest."user" where email = ${owner.email}`;
  await sql`update nodinest.learning_records set visibility = 'public', status = 'completed'
    where user_id = ${u.id} and resource_id = ${id}`;
  await sql.end();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signIn(other, { email: "looks@example.test", password: "Abcdefg12345", name: "Qaragan" });
  // The profile counts it, and an old link to the library lands on the public card.
  await other.goto(`/u/${u.username}`);
  await expect(other.getByText("Kitob öqigan")).toBeVisible();
  await other.goto(`/library/${id}`);
  await expect(other).toHaveURL(new RegExp(`/u/${u.username}/item/${id}`));
  await expect(other.getByRole("heading", { name: "Ochiq darslik" })).toBeVisible();
  await expect(other.getByRole("button", { name: "Özimga oliş" })).toBeVisible();
  await expect(other.getByText("Mening qaydlarim")).toHaveCount(0);
  // A write-up stays private until its owner shows it.
  await expect(other.getByRole("heading", { name: "Taqriz" })).toHaveCount(0);
  const db2 = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await db2`insert into nodinest.writeups (user_id, resource_id, doc, is_public) values (
    ${u.id}, ${id}, ${db2.json({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Ochiq fikr" }] }],
    })}, true)`;
  await db2.end();
  await other.reload();
  await expect(other.getByRole("heading", { name: "Taqriz" })).toBeVisible();
  await expect(other.getByText("Ochiq fikr")).toBeVisible();
  await ctx.close();
});
