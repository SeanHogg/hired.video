/**
 * Pre-push extension bootstrap — runs in front of `drizzle-kit push`
 * (chained in the api/package.json `db:push` script).
 *
 * Why this exists:
 *   CI applies the schema in two steps: `drizzle-kit push --force` against
 *   src/db/schema/*.ts, THEN scripts/run-sql-migrations.mjs. Push creates
 *   every index the schema declares — including the pg_trgm GIN indexes
 *   (`gin_trgm_ops`, migration 0495) — before any migration file runs. If
 *   the extension doesn't exist yet, push fails with
 *   `operator class "gin_trgm_ops" does not exist for access method "gin"`
 *   and the deploy aborts. A `CREATE EXTENSION` inside a migration can't
 *   help because the runner goes second.
 *
 * Contract:
 *   • Only idempotent `CREATE EXTENSION IF NOT EXISTS` statements live here.
 *     Anything else belongs in a drizzle/NNNN_*.sql migration.
 *   • Every extension listed here must also be created by a migration
 *     (0495 for pg_trgm) so a DB bootstrapped from migrations alone matches.
 *   • Transient connection failures retry via the migration runner's
 *     `withRetry`; any real SQL error fails the deploy loud, exactly like
 *     push itself would have.
 */

import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { withRetry } from "./run-sql-migrations.mjs";

/** Extensions the Drizzle schema depends on at push time. */
export const REQUIRED_EXTENSIONS = Object.freeze([
  // gin_trgm_ops — trigram GIN indexes backing the ILIKE '%term%' search
  // paths on job_items / users / company_profiles / cities (0495).
  "pg_trgm",
]);

async function main() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  for (const ext of REQUIRED_EXTENSIONS) {
    // Extension names can't be parameterised; REQUIRED_EXTENSIONS is a
    // static literal list above, so there's no injection surface.
    await withRetry(() => sql(`CREATE EXTENSION IF NOT EXISTS ${ext}`));
    console.log(`extension ${ext}: ok`);
  }
}

// Only auto-run when invoked directly — imports for testing must not
// touch the database.
if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL: ensure-db-extensions failed:", e?.message ?? e);
    process.exit(1);
  });
}
