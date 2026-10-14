CREATE TABLE "nodinest"."app_handoffs" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"session_cookie" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Server-only: RLS on, no policy and no grant for the app role.
ALTER TABLE nodinest.app_handoffs ENABLE ROW LEVEL SECURITY;
