/**
 * One-off diagnostic — probes live DB to understand what's preventing the
 * 0122 + 0123 migration batch from landing. Delete after use.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Tiny .env loader (dotenv isn't in api/package.json deps).
const envPath = join(process.cwd(), ".env");
try {
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    const v = vRaw.replace(/^['"]|['"]$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const sql = neon(process.env.DATABASE_URL);

const tables = [
  "scheduled_events",
  "calendar_connections",
  "availability_slots",
  "tasks",
  "job_items",
  "event_attendees",
  "event_co_hosts",
  "event_waitlist",
  "event_reminders_sent",
  "event_matchmaking",
  "shared_task_participants",
  "coffee_requests",
  "event_categories",
];

const present = await sql(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
  [tables],
);
const presentSet = new Set(present.map((r) => r.table_name));
console.log("Table presence:");
for (const t of tables) console.log(`  ${presentSet.has(t) ? "YES" : "NO "}  ${t}`);

const job = await sql(`SELECT
  COUNT(*) FILTER (WHERE attisdropped = false AND attnum > 0) AS live,
  COUNT(*) FILTER (WHERE attisdropped = true) AS dropped,
  COUNT(*) FILTER (WHERE attnum > 0) AS total_user
FROM pg_attribute WHERE attrelid = 'job_items'::regclass`);
console.log("\njob_items slots:", job[0]);

const rowCount = await sql(`SELECT COUNT(*)::int AS n FROM job_items`);
console.log("job_items row count:", rowCount[0].n);

const apps = await sql(
  `SELECT name FROM _sql_migrations WHERE name LIKE '012%' OR name LIKE '011%' ORDER BY name`,
);
console.log("\nRecorded migrations 011x/012x:");
apps.forEach((r) => console.log("  " + r.name));
