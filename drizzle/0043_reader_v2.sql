-- The reading layout now names speakers and drops running headers: laid out again.
UPDATE nodinest.book_pages SET formatted = NULL;
--> statement-breakpoint
-- Everyone starts public; a person can close their profile in Settings.
UPDATE nodinest."user" SET profile_public = true;
