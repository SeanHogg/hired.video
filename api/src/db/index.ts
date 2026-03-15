import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.js";

export function getDb(databaseUrl?: string) {
  const resolvedUrl =
    databaseUrl ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.NEON_DB_URL;

  if (!resolvedUrl) {
    throw new Error(
      "No database connection string was provided to `neon()`. Please set DATABASE_URL or NEON_DATABASE_URL in your environment.",
    );
  }

  const sql = neon(resolvedUrl);
  return drizzle(sql, { schema });
}

export { schema };
export type Db = ReturnType<typeof getDb>;
