import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["nodinest"],
  dbCredentials: {
    url: process.env.EU_DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: false,
});
