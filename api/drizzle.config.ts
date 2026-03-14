import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Used only for local migration generation — not deployed to Workers
    url: process.env["DATABASE_URL"] ?? "",
  },
});
