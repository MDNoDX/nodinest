-- Other users: 15 AI requests a day (the superadmin account is never limited).
-- Stored settings win over the AI_DAILY_LIMIT_PER_USER environment default.
INSERT INTO "nodinest"."app_settings" ("key", "value")
VALUES ('ai', '{"dailyLimitPerUser": 15}'::jsonb)
ON CONFLICT ("key") DO UPDATE
SET "value" = "nodinest"."app_settings"."value" || '{"dailyLimitPerUser": 15}'::jsonb;
