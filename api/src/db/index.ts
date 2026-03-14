import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/**
 * Creates a Drizzle ORM client connected to Neon Postgres via the serverless
 * HTTP driver. Call once per request using the DATABASE_URL binding.
 */
export function getDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof getDb>;

// Re-export schema for convenience
export { schema };
