/**
 * Optional: seeds a starter topic taxonomy (categories). Idempotent.
 * It does NOT create books, people, notes or statistics — no fake data.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

const CATEGORIES: [slug: string, uz: string, en: string][] = [
  ["history", "Tarix", "History"],
  ["philosophy", "Falsafa", "Philosophy"],
  ["literature", "Adabiyot", "Literature"],
  ["science", "Fan", "Science"],
  ["technology", "Texnologiya", "Technology"],
  ["programming", "Dasturlash", "Programming"],
  ["economics", "Iqtisodiyot", "Economics"],
  ["psychology", "Psixologiya", "Psychology"],
  ["religion", "Din", "Religion"],
  ["languages", "Tillar", "Languages"],
  ["self-development", "Shaxsiy rivojlanish", "Self-development"],
  ["mathematics", "Matematika", "Mathematics"],
  ["fantasy", "Fantastika", "Science fiction & fantasy"],
  ["romance", "Romantika", "Romance"],
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!, {
    max: 1,
    onnotice: () => {},
  });
  let i = 0;
  for (const [slug, uz, en] of CATEGORIES) {
    await sql`insert into nodinest.categories (slug, name_uz, name_en, sort_order) values (${slug}, ${uz}, ${en}, ${i++})
      on conflict (slug) do nothing`;
  }
  await sql.end();
  console.log(`✓ ${CATEGORIES.length} categories ensured`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
