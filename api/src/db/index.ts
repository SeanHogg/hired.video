import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.js";

/**
 * One Drizzle instance per connection string, per isolate. Building one is
 * NOT cheap: `drizzle(sql, { schema })` walks all ~430 tables + relations to
 * build the relational-query config — ~9.5ms of CPU per call, i.e. the whole
 * Workers Free per-request CPU budget (10ms). With 1,500+ `getDb()` call sites
 * a single request paid it several times over and Cloudflare killed it with
 * error 1102 (empty-body 503). Reuse is safe: the neon HTTP driver holds no
 * connection or request-bound I/O — each query is its own `fetch`.
 */
const dbByUrl = new Map<string, ReturnType<typeof createDb>>();

function createDb(url: string) {
  return drizzle(neon(url), { schema });
}

export function getDb(databaseUrl?: string) {
  const resolvedUrl =
    databaseUrl ||
    // Common Node/Cloudflare runtime env access
    process?.env?.DATABASE_URL ||
    process?.env?.NEON_DATABASE_URL ||
    process?.env?.NEON_DB_URL ||
    // Cloudflare Worker bindings are also available via the `env` argument.
    // We store it on globalThis.__ENV in worker.ts for ease of access.
    (globalThis as any).__ENV?.DATABASE_URL ||
    (globalThis as any).__ENV?.NEON_DATABASE_URL ||
    (globalThis as any).__ENV?.NEON_DB_URL ||
    // Fall back to any globals (in case other mechanisms expose them).
    (globalThis as any).DATABASE_URL ||
    (globalThis as any).NEON_DATABASE_URL ||
    (globalThis as any).NEON_DB_URL;

  if (!resolvedUrl) {
    // Help debug which binding names are present (without exposing secrets).
    const availability = {
      DATABASE_URL: Boolean(process?.env?.DATABASE_URL || (globalThis as any).DATABASE_URL),
      NEON_DATABASE_URL: Boolean(
        process?.env?.NEON_DATABASE_URL || (globalThis as any).NEON_DATABASE_URL,
      ),
      NEON_DB_URL: Boolean(process?.env?.NEON_DB_URL || (globalThis as any).NEON_DB_URL),
    };

    throw new Error(
      "No database connection string was provided to `neon()`. Please set DATABASE_URL, NEON_DATABASE_URL, or NEON_DB_URL in your environment. " +
        `Detected: ${JSON.stringify(availability)}`,
    );
  }

  let db = dbByUrl.get(resolvedUrl);
  if (!db) {
    db = createDb(resolvedUrl);
    dbByUrl.set(resolvedUrl, db);
  }
  return db;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
