import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";
import { signIn } from "./helpers";

test.use({ viewport: { width: 375, height: 760 }, hasTouch: true, isMobile: true });

/** A book as such PDFs come out: its header, the number and the text run together. */
async function addPages(email: string, resourceId: string) {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  const [{ id: userId }] = await sql`select id from nodinest."user" where email = ${email}`;
  const [{ id: sourceId }] = await sql`
    insert into nodinest.book_text_sources (user_id, resource_id, kind, url, status, pages)
    values (${userId}, ${resourceId}, 'url', 'https://example.test/book', 'ready', 12)
    returning id`;
  for (let n = 1; n <= 12; n++) {
    const long = `Chol${n} yana dengizga${n} qaradi va uzoq${n} o‘yladi. `.repeat(n === 4 ? 60 : 3);
    const content = `Ernest Heminguey. Chol va dengiz (qissa) www.ziyouz.com kutubxonasi ${n} sahifa${n} boshlanadi${n} ${long}\n— Yana${n} picha yesang-chi,— dedi u${n}.— Uyalma${n}.`;
    const formatted =
      n === 3
        ? sql.json([
            { k: "p", t: `www.ziyouz.com kutubxonasi ${n} Bola qaytib keldi.` },
            { k: "d", t: "— Tayyormisan?", s: "Chol" },
            { k: "d", t: "— Tayyorman.", s: "Bola" },
          ])
        : null;
    await sql`
      insert into nodinest.book_pages (source_id, user_id, resource_id, page, content, formatted)
      values (${sourceId}, ${userId}, ${resourceId}, ${n}, ${content}, ${formatted})`;
  }
  await sql.end();
}

test("the reader on a phone: clean pages, one text size, everyone in their colour", async ({
  page,
}) => {
  const email = "reader@example.test";
  await signIn(page, { email, password: "Abcdefg12345", name: "Oqish Sinov" });
  await page.goto("/library/new");
  await page.getByLabel("Nomi", { exact: true }).fill("Chol va dengiz");
  await page.getByRole("button", { name: "Saqlaş" }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}/);
  const id = /library\/([0-9a-f-]{36})/.exec(page.url())![1];
  await addPages(email, id);

  await page.goto(`/library/${id}/read`);
  const body = page.locator("[data-sheet=one] .book-body");
  await expect(body.locator("p").first()).toBeVisible();

  const sizes = new Set<string>();
  const seen = async () => {
    const text = await body.innerText();
    expect(text).not.toMatch(/ziyouz|kutubxonasi/i);
    sizes.add(
      await body
        .locator("p")
        .first()
        .evaluate((p) => getComputedStyle(p).fontSize),
    );
    return text;
  };
  // The title stays on the first page or two, then it is gone.
  await seen();
  const turn = async () => {
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".book-turn")).toHaveCount(0);
  };
  await turn();
  await seen();
  await turn();
  expect(await seen()).not.toMatch(/Chol va dengiz/);

  // A page already laid out: each person's name and colour.
  await expect(body.locator(".book-who")).toHaveText(["Chol", "Bola"]);
  const colours = await body
    .locator(".book-d[data-who]")
    .evaluateAll((all) => all.map((d) => getComputedStyle(d).color));
  expect(colours[0]).not.toBe(colours[1]);

  // A long page keeps the size and scrolls.
  await turn();
  await seen();
  const scrolls = await body.evaluate((b) => b.scrollHeight > b.clientHeight + 1);
  expect(scrolls).toBe(true);
  // Dialogue with dashes, read without any AI: the narrator's words stand apart.
  expect(await body.locator(".book-d").count()).toBeGreaterThanOrEqual(2);
  expect(sizes.size).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});
