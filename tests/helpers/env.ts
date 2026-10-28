// Point the app's shared `db` (src/db/index.ts) at the test database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://mdnodx@127.0.0.1:5432/nodinest_test";
process.env.DB_RLS_ROLE ??= "nodinest_app";
// Never let a production override (src/db/index.ts prefers it) reach the tests.
delete process.env.EU_DATABASE_URL;
