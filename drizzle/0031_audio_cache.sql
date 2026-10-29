CREATE TABLE "nodinest"."audio_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"tg_parts" jsonb NOT NULL,
	"seconds" real NOT NULL,
	"marks" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodinest"."voice_samples" (
	"key" text PRIMARY KEY NOT NULL,
	"mp3_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodinest"."audiobooks" ADD COLUMN "text_hash" text;--> statement-breakpoint
CREATE INDEX "audiobooks_text_hash_idx" ON "nodinest"."audiobooks" USING btree ("text_hash");--> statement-breakpoint
ALTER TABLE nodinest.audio_cache ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE nodinest.voice_samples ENABLE ROW LEVEL SECURITY;
