import { expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { E2E_DB } from "../../playwright.config";

/** The first-visit guide (and the start checklist) would get in the way: mark them as seen. */
async function skipTour(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("nodinest-tour-v1", "1");
      localStorage.setItem("nodinest-start-hidden", "1");
    } catch {
      /* ignore */
    }
  });
}

export async function signUp(page: Page, u: { name: string; email: string; password: string }) {
  await skipTour(page);
  await page.goto("/login");
  await page.locator("[data-hydrated=true]").waitFor(); // hydrated (cold dev compiles are slow)
  await page.getByLabel("Ism").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Parol").fill(u.password);
  await page.getByRole("button", { name: "Lokal hisob yaratish" }).click();
  await expect(page).toHaveURL("/");
}

export async function signIn(page: Page, u: { email: string; password: string; name?: string }) {
  // Make tests independent of order: create the account if it doesn't exist yet.
  await page.request.post("/api/auth/sign-up/email", {
    data: { email: u.email, password: u.password, name: u.name ?? u.email.split("@")[0] },
    headers: { origin: "http://localhost:3200" },
    failOnStatusCode: false,
  });
  await page.context().clearCookies();
  await skipTour(page);
  await page.goto("/login");
  await page.locator("[data-hydrated=true]").waitFor(); // hydrated (cold dev compiles are slow)
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Parol").fill(u.password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  // Signing in continues where the user stopped (/resume), or the home page.
  await expect(page).not.toHaveURL(/\/login/);
}

/** Test-only privileged helper (the app itself never grants roles this way). */
export async function makeSuperadmin(email: string) {
  const sql = postgres(E2E_DB, { max: 1, onnotice: () => {} });
  await sql`update nodinest."user" set role = 'superadmin' where email = ${email}`;
  await sql.end();
}
