/**
 * "Continue with Telegram" as a Better Auth plugin. The browser gets the signed
 * login data from oauth.telegram.org (see /login/telegram) and posts it here;
 * the signature is checked with the bot token, then the user is found or
 * created by the Telegram id (account provider "telegram") and signed in.
 * Telegram gives no email: a unique placeholder address is stored instead.
 * Enabled only when TELEGRAM_BOT_TOKEN is set.
 */
import "server-only";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";
import { verifyTelegram } from "./telegram-verify";

const body = z.object({
  id: z.union([z.number(), z.string()]),
  first_name: z.string().max(200).optional(),
  last_name: z.string().max(200).optional(),
  username: z.string().max(100).optional(),
  photo_url: z.string().max(500).optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().max(100),
});

export const telegram = (botToken: string) =>
  ({
    id: "telegram",
    endpoints: {
      telegramCallback: createAuthEndpoint(
        "/telegram/callback",
        { method: "POST", body },
        async (ctx) => {
          const tg = verifyTelegram(ctx.body, botToken);
          if (!tg) throw new APIError("UNAUTHORIZED", { message: "invalid telegram login" });
          const name =
            [tg.first_name, tg.last_name].filter(Boolean).join(" ").trim() ||
            tg.username ||
            `Telegram ${tg.id}`;
          const photo = tg.photo_url?.startsWith("https://") ? tg.photo_url : undefined;
          const result = await handleOAuthUserInfo(ctx, {
            userInfo: {
              id: String(tg.id),
              email: `tg${tg.id}@telegram.nodinest.invalid`,
              emailVerified: false,
              name: name.slice(0, 120),
              image: photo,
            },
            account: { providerId: "telegram", accountId: String(tg.id) },
          });
          if (result.error || !result.data)
            throw new APIError("UNAUTHORIZED", { message: result.error ?? "failed" });
          await setSessionCookie(ctx, result.data);
          return ctx.json({ ok: true });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
