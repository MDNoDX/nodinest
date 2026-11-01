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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { eq, sql } from "drizzle-orm";
import { codeMail, mailConfigured, sendMail } from "@/server/mail";
import { hitRateLimit } from "@/server/rate-limit";
import { enforceDeviceLimit } from "@/server/account-security";

const googleConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: "NodiNote",
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
    // Google or an e-mailed code, then choose a password at /welcome.
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
        "/email-otp/request-password-reset",
        "/forget-password/email-otp",
        "/email-otp/reset-password",
        "/email-otp/check-verification-otp",
        "/email-otp/verify-email",
      ],
  hooks: {
    // E-mail codes: the plugin stores a fresh code on every request, so the
    // limits and the superadmin rule must stand in front of it.
    before: createAuthMiddleware(async (c) => {
      if (c.path !== "/email-otp/send-verification-otp" && c.path !== "/sign-in/email-otp") return;
      const email = String(c.body?.email ?? "")
        .trim()
        .toLowerCase();
      const ip = c.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      const owners = (process.env.SUPERADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase());
      const [u] = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(sql`lower(${schema.user.email})`, email));
      if (owners.includes(email) || u?.role === "superadmin")
        throw new APIError("FORBIDDEN", { message: "Not allowed" });
      const a = await hitRateLimit(db, `otp-gate:${c.path}:${email}`, 8, 3600);
      const b = await hitRateLimit(db, `otp-gate-ip:${ip}`, 40, 3600);
      if (!a.allowed || !b.allowed)
        throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts" });
    }),
  },
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
  plugins: [
    ...(mailConfigured()
      ? [
          emailOTP({
            otpLength: 6,
            expiresIn: 600,
            allowedAttempts: 3,
            storeOTP: "hashed",
            async sendVerificationOTP({ email, otp, type }) {
              if (type !== "sign-in") return;
              const e = email.toLowerCase();
              // The superadmin account signs in with Google only.
              const [u] = await db
                .select({ role: schema.user.role, locale: schema.user.locale })
                .from(schema.user)
                .where(eq(sql`lower(${schema.user.email})`, e));
              if (u?.role === "superadmin") return;
              if (!(await hitRateLimit(db, `otp:${e}`, 5, 3600)).allowed) return;
              const m = codeMail(otp, u?.locale ?? "uz");
              await sendMail({ to: e, ...m }).catch((err) =>
                console.error("[nodinest] mail failed:", err instanceof Error ? err.message : err),
              );
            },
          }),
        ]
      : []),
    nextCookies(),
  ],
});

export const authProviders = {
  google: googleConfigured,
  devLogin: isDevLoginEnabled(),
  /** Sign-in with a code sent by e-mail. */
  email: mailConfigured(),
};
