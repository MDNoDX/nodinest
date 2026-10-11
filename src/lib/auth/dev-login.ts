/**
 * Email+password login for local development and E2E tests only.
 * It can never be enabled in a production build.
 */
export function isDevLoginEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_LOGIN === "true";
}
