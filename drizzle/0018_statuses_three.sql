-- Three reading states only: planned / in progress / completed.
UPDATE "nodinest"."learning_records" SET "status" = 'in_progress'
WHERE "status" IN ('paused', 'abandoned');
