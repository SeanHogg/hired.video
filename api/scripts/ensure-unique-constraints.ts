/**
 * Pre-push: create every declared UNIQUE constraint that the database lacks.
 * Chained in the api/package.json `db:push` script after ensure-db-extensions
 * and BEFORE `drizzle-kit push`.
 *
 * Why: for a missing unique constraint on a non-empty table, drizzle-kit
 * prompts "Do you want to truncate <table>?" — even with --force — and CI has
 * no TTY, so every deploy aborted (magic_link_tokens_token_unique, 2026-10-10).
 * Creating the constraint here, under the exact name push expects, means push
 * sees it present and has nothing to ask.
 *
 * NEVER deletes or rewrites rows. If existing duplicates make a constraint
 * impossible, it is reported as a warning and skipped; push will then stop on
 * its prompt, which is the correct outcome — resolving duplicate data is an
 * owner decision, not something a deploy does on its own.
 *
 *   node --import tsx scripts/ensure-unique-constraints.ts
 */
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import { argv } from "node:process";
import { withRetry } from "./run-sql-migrations.mjs";
import {
  addUniqueConstraintSql,
  declaredUniqueConstraints,
  type DeclaredUniqueConstraint,
} from "../src/db/schema-catalog.js";

type Query = (text: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;

export interface EnsureResult {
  created: string[];
  skippedDuplicates: string[];
}

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = "23505";

export async function ensureUniqueConstraints(
  query: Query,
  declared: DeclaredUniqueConstraint[],
  log: (line: string) => void = console.log,
): Promise<EnsureResult> {
  const result: EnsureResult = { created: [], skippedDuplicates: [] };
  if (declared.length === 0) return result;

  const tables = [...new Set(declared.map((c) => c.table))];
  const existingTables = new Set(
    (await query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [tables],
    )).map((r) => String(r.tablename)),
  );
  const existingConstraints = new Set(
    (await query(
      `SELECT c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public' AND c.contype = 'u'`,
    )).map((r) => String(r.conname)),
  );

  for (const c of declared) {
    // A table push has yet to create gets the constraint from push itself.
    if (!existingTables.has(c.table) || existingConstraints.has(c.name)) continue;
    try {
      await query(addUniqueConstraintSql(c));
      result.created.push(c.name);
      log(`unique constraint ${c.name}: created`);
    } catch (err) {
      if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
      result.skippedDuplicates.push(c.name);
      log(`WARNING unique constraint ${c.name} on ${c.table}(${c.columns.join(", ")}): existing duplicate rows — not created; resolve the duplicates (owner decision) before push can add it`);
    }
  }
  return result;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const sql = neon(url);
  const query: Query = (text, params) => withRetry(() => sql(text, params ?? []));
  const { created, skippedDuplicates } = await ensureUniqueConstraints(query, declaredUniqueConstraints());
  console.log(`unique constraints: ${created.length} created, ${skippedDuplicates.length} blocked by duplicates`);
  if (skippedDuplicates.length > 0) {
    console.error("FATAL: unique constraints blocked by duplicate rows; resolve them before push.");
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => {
    console.error("FATAL: ensure-unique-constraints failed:", e?.message ?? e);
    process.exit(1);
  });
}
