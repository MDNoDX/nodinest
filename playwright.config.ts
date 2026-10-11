import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
export const E2E_DB =
  process.env.E2E_DATABASE_URL ?? "postgres://mdnodx@127.0.0.1:5432/nodinest_e2e";

/**
 * E2E runs against `next dev` on a dedicated database with the development
 * email/password login enabled (never available in production builds).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", locale: "uz-UZ" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DB,
      DATABASE_URL_UNPOOLED: "",
      DB_RLS_ROLE: "nodinest_app",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      BETTER_AUTH_SECRET: "e2e-only-secret-0123456789abcdef0123456789",
      ENABLE_DEV_LOGIN: "true",
      GEMINI_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      SUPABASE_URL: "",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
