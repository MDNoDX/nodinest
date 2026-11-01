/**
 * Better Auth configuration (server only).
 *
 * Roles are NEVER client-settable (additionalFields input:false). The
 * superadmin role is granted server-side in `bootstrapSuperadmin` only when a
 * user has a linked Google account whose Google-verified email is listed in
 * SUPERADMIN_EMAILS. See docs/SECURITY.md.
 */
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { bootstrapSuperadmin, isUserSuspended, seedNewUser } from "./bootstrap";
import { isDevLoginEnabled } from "./dev-login";
import { notifyNewUser } from "@/server/monitor/events";
import { enforceDeviceLimit } from "@/server/account-security";

const googleConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: "Roznoma",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  advanced: {
    database: { generateId: "uuid" },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    // Signed cookie copy of the session: no session-table query per request.
    // Safe because getCurrentUser() still re-reads role + status from the DB.
    // Short, so a device removed in Settings is out within a minute.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "user", input: false },
      status: { type: "string", required: false, defaultValue: "active", input: false },
      locale: { type: "string", required: false, defaultValue: "uz", input: false },
      timezone: { type: "string", required: false, defaultValue: "Asia/Tashkent", input: false },
    },
  },
  emailAndPassword: {
    // Signing in with a password is open (by username, server/account-security);
    // creating an account this way only in development: accounts start with
    // Google, then choose a password at /welcome. Without Google a person gets
    // back in with a code by e-mail (server/password-reset).
    enabled: true,
    disableSignUp: !isDevLoginEnabled(),
    autoSignIn: true,
    minPasswordLength: 8,
  },
  // The app has its own guarded ways for these (server/account-security,
  // password-reset); only development signs in through the raw endpoints.
  disabledPaths: isDevLoginEnabled()
    ? []
    : [
        "/sign-in/email",
        "/change-password",
        "/set-password",
        "/update-user",
        "/change-email",
        "/delete-user",
        "/request-password-reset",
        "/reset-password",
        "/verify-password",
      ],
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    window: 60,
    max: 60,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await seedNewUser(db, u.id);
          await notifyNewUser(u).catch(() => {});
        },
      },
    },
    session: {
      create: {
        before: async (s) => {
          if (await isUserSuspended(db, s.userId)) return false;
          return { data: s };
        },
        after: async (s) => {
          await bootstrapSuperadmin(db, s.userId, process.env.SUPERADMIN_EMAILS);
          await enforceDeviceLimit(s.userId, s.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export const authProviders = {
  google: googleConfigured,
  devLogin: isDevLoginEnabled(),
};
