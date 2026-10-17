import { defineConfig } from "drizzle-kit";
import { declaredTableNames } from "./src/db/schema-catalog";

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL || "",
  },
  // Push only ever sees the tables the schema declares. Without this, push
  // drops every table that exists only in SQL migrations — including
  // `_sql_migrations`, the runner's ledger, which would make the next deploy
  // re-run every migration. Tables are dropped by numbered migrations only.
  tablesFilter: declaredTableNames(),
  // Only the public schema is push-managed. Retired tables are moved to the
  // `archive` schema by numbered migrations (0545+) and must stay invisible
  // to push, which would otherwise try to drop that schema.
  schemaFilter: ["public"],
  verbose: true,
  strict: false,
});
