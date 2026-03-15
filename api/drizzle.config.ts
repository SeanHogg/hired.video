import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/db/schema/users.ts",
    "./src/db/schema/companies.ts",
    "./src/db/schema/resumes.ts",
    "./src/db/schema/jobs.ts",
    "./src/db/schema/videos.ts",
    "./src/db/schema/messaging.ts",
    "./src/db/schema/billing.ts",
    "./src/db/schema/affiliates.ts",
    "./src/db/schema/recruiter.ts",
    "./src/db/schema/analytics.ts",
    "./src/db/schema/productivity.ts",
    "./src/db/schema/locations.ts",
    "./src/db/schema/ai.ts",
    "./src/db/schema/feed.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_DB_URL || "",
  },
  verbose: true,
  strict: false,
});
