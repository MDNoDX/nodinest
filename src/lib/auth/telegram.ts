/**
 * "Continue with Telegram" as a Better Auth plugin, confirmed in our own bot
 * (see server/telegram-login.ts): no phone number and no code from Telegram.
 *   POST /api/auth/telegram/start → { link } + a secret cookie for this browser
 *   POST /api/auth/telegram/poll  { code } → { state: pending | gone | ok }
 * On "ok" the user is found or created by the Telegram id (account provider
 * "telegram") and signed in. Telegram gives no email: a unique placeholder
 * address is stored instead. Enabled only when TELEGRAM_BOT_TOKEN is set.
 */
import "server-only";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { sql } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/db";
import { botUsername } from "@/server/monitor/telegram";
import { hitRateLimit } from "@/server/rate-limit";
import {
  BROWSER_COOKIE,
  LOGIN_TTL_MS,
  createLoginCode,
  redeemLogin,
} from "@/server/telegram-login";

export const telegramEmail = (id: number | string) => `tg${id}@telegram.nodinest.invalid`;

const ipOf = (h: Headers | undefined) =>
  h?.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

export const telegram = () =>
  ({
    id: "telegram",
    endpoints: {
      telegramStart: createAuthEndpoint("/telegram/start", { method: "POST" }, async (ctx) => {
        const ip = ipOf(ctx.headers);
        if (!(await hitRateLimit(db, `tg-start:${ip}`, 20, 600)).allowed)
          throw new APIError("TOO_MANY_REQUESTS", { message: "rate_limited" });
        const bot = await botUsername();
        if (!bot) throw new APIError("SERVICE_UNAVAILABLE", { message: "bot_unavailable" });
        const { code, browser } = await createLoginCode(ctx.headers?.get("user-agent") ?? "");
        ctx.setCookie(BROWSER_COOKIE, browser, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/api/auth/telegram",
          maxAge: LOGIN_TTL_MS / 1000,
        });
        return ctx.json({
          code,
          link: `https://t.me/${bot}?start=login_${code}`,
          app: `tg://resolve?domain=${bot}&start=login_${code}`,
          expiresIn: LOGIN_TTL_MS / 1000,
        });
      }),
      telegramPoll: createAuthEndpoint(
        "/telegram/poll",
        { method: "POST", body: z.object({ code: z.string().max(64) }) },
        async (ctx) => {
          const ip = ipOf(ctx.headers);
          if (!(await hitRateLimit(db, `tg-poll:${ip}`, 600, 600)).allowed)
            throw new APIError("TOO_MANY_REQUESTS", { message: "rate_limited" });
          const r = await redeemLogin(ctx.body.code, ctx.getCookie(BROWSER_COOKIE) ?? undefined);
          if (r.state !== "ok") return ctx.json({ state: r.state });
          const tg = r.tg;
          const first = (tg.first_name ?? "").trim();
          const last = (tg.last_name ?? "").trim();
          const name =
            [first, last].filter(Boolean).join(" ") || tg.username || `Telegram ${tg.id}`;
          const result = await handleOAuthUserInfo(ctx, {
            userInfo: {
              id: String(tg.id),
              email: telegramEmail(tg.id),
              emailVerified: false,
              name: name.slice(0, 120),
            },
            account: { providerId: "telegram", accountId: String(tg.id) },
          });
          if (result.error || !result.data)
            throw new APIError("UNAUTHORIZED", { message: result.error ?? "failed" });
          const userId = result.data.user.id;
          // First / last name as Telegram has them (only when not set yet).
          await db.execute(sql`
            update nodinest."user" set
              first_name = coalesce(first_name, ${first || null}),
              last_name = coalesce(last_name, ${last || null})
            where id = ${userId}`);
          await db.execute(sql`
            insert into nodinest.bot_users (tg_id, username, first_name, language, user_id)
            values (${tg.id}, ${tg.username ?? null}, ${first || null}, ${tg.language_code ?? null}, ${userId})
            on conflict (tg_id) do update set user_id = excluded.user_id,
              username = excluded.username, last_seen_at = now()`);
          ctx.setCookie(BROWSER_COOKIE, "", { path: "/api/auth/telegram", maxAge: 0 });
          await setSessionCookie(ctx, result.data);
          return ctx.json({ state: "ok" });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
