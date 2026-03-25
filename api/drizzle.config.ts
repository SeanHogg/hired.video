import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL || "",
  },
  verbose: true,
  strict: false,
});
