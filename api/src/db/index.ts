import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.js";

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is required");
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export { schema };
