-- Files moved from Vercel Blob to Netlify Blobs (same paths): one bucket name for the store.
UPDATE "nodinest"."files" SET "bucket" = 'blob' WHERE "bucket" = 'vercel-blob';
