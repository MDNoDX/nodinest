import { sql, type SQL } from "drizzle-orm";

/** Builds `ARRAY[$1, $2, …]::text[]` with each value bound as a parameter. */
export function textArray(values: string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}
