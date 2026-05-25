/**
 * One-shot generator (gap #1187 backfill) — for every table in the
 * KNOWN_MISSING_CREATE_TABLE allowlist, introspects the live DB and
 * emits a CREATE TABLE IF NOT EXISTS migration that matches what
 * production already has.
 *
 * The live DB is the source of truth because these tables were created
 * via out-of-tree `drizzle-kit push` years ago — the TypeScript
 * declarations in schema/*.ts have drifted in places, and the migration
 * files are what fresh-deploy CI relies on. We introspect once, emit
 * idempotent files, and parity check goes green.
 *
 * Strategy:
 *   1. Topologically sort the allowlist by FK dependency so each
 *      `CREATE TABLE` references only tables already created.
 *   2. Emit ONE migration file per logical batch (split by ~30 tables
 *      to keep file size manageable).
 *   3. Columns rendered with their actual data type, nullability, and
 *      default expression (extracted from pg_attrdef).
 *   4. PKs / UNIQUE / CHECK constraints inlined into CREATE TABLE.
 *   5. FKs emitted as ALTER TABLE ADD CONSTRAINT after the table block
 *      (so a forward reference to a table later in the same batch
 *      still resolves).
 *   6. Indexes emitted after the FK pass via their pg_get_indexdef
 *      output, rewritten to use CREATE INDEX IF NOT EXISTS.
 *
 * Run once, commit the output, delete this script.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

const ALLOWLIST = [
  "account_invitations", "account_preferences", "activity_logs",
  "ai_chat_messages", "ai_chat_sessions", "ai_usage_records",
  "answer_cache", "api_keys", "application_form_answers",
  "application_notes", "assessment_attempts", "ats_connections",
  "billing_events", "boards", "business_phone_numbers", "call_logs",
  "candidate_interactions", "candidate_submissions", "cities",
  "communication_tracking", "company_followers", "company_profiles",
  "company_subscriptions", "conversation_participants", "conversations",
  "countries", "dashboard_metrics", "email_campaign_recipients",
  "email_campaigns", "email_templates", "email_verification_tokens",
  "employer_branding_pages", "feature_flags", "feed_post_comments",
  "feed_post_likes", "feed_post_reports", "feed_posts",
  "follow_up_enrollments", "follow_up_logs", "follow_up_sequences",
  "follow_up_steps", "interviews", "invoice_line_items", "invoices",
  "job_alerts", "job_applications", "job_board_postings",
  "job_board_sources", "job_board_sync_log", "job_boards", "job_items",
  "job_preferences", "job_websites", "magic_link_tokens",
  "marketing_leads", "message_read_receipts", "messages",
  "meta_resumes", "notifications", "oauth_accounts", "password_history",
  "password_reset_tokens", "payment_methods", "performance_cycles",
  "performance_goals", "performance_reviews",
  "phone_balance_transactions", "phone_balances", "placements",
  "postal_zip_codes", "profile_views", "queue_job_to_process",
  "queue_job_to_resume", "recruiter_talent_pools", "refresh_tokens",
  "refund_requests", "request_logs", "resume_information",
  "resume_templates", "roles", "saved_jobs", "saved_searches",
  "skill_assessments", "sms_messages", "state_provinces",
  "studio_projects", "subscription_plans", "subscriptions",
  "system_settings", "talent_pool_candidates", "tasks",
  "two_factor_codes", "usage_records", "user_company_role_associations",
  "user_connections", "user_engagement_metrics", "user_profiles",
  "user_roles", "users", "videos", "watched_resumes",
  "webauthn_challenges", "webauthn_credentials",
];

// ─── Filter to tables that actually exist in DB ────────────────────────
const presentRows = await sql(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
  [ALLOWLIST],
);
const present = new Set(presentRows.map((r) => r.table_name));
const skipped = ALLOWLIST.filter((t) => !present.has(t));
const tables = ALLOWLIST.filter((t) => present.has(t));
console.log(`Present in DB: ${tables.length} / Skipped (absent): ${skipped.length}`);
if (skipped.length) console.log("  skipped:", skipped.join(", "));

// ─── Introspect each table ─────────────────────────────────────────────
async function introspect(table) {
  const cols = await sql(
    `SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_expr
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass
       AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [`public.${table}`],
  );

  const cons = await sql(
    `SELECT conname, contype, pg_get_constraintdef(oid) AS def
     FROM pg_constraint WHERE conrelid = $1::regclass ORDER BY conname`,
    [`public.${table}`],
  );

  const indexes = await sql(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = $1
     ORDER BY indexname`,
    [table],
  );

  return { cols, cons, indexes };
}

// ─── Topo-sort by FK dependency ────────────────────────────────────────
async function depGraph(tables) {
  const inSet = new Set(tables);
  const deps = new Map(tables.map((t) => [t, new Set()]));
  for (const t of tables) {
    const rows = await sql(
      `SELECT (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS refs
       FROM pg_constraint c WHERE c.conrelid = $1::regclass AND c.contype = 'f'`,
      [`public.${t}`],
    );
    for (const r of rows) {
      if (r.refs && r.refs !== t && inSet.has(r.refs)) deps.get(t).add(r.refs);
    }
  }
  const ordered = [];
  const visited = new Set();
  const visiting = new Set();
  function visit(t) {
    if (visited.has(t)) return;
    if (visiting.has(t)) return; // cycle — skip to avoid infinite recursion
    visiting.add(t);
    for (const d of deps.get(t)) visit(d);
    visiting.delete(t);
    visited.add(t);
    ordered.push(t);
  }
  for (const t of tables) visit(t);
  return ordered;
}

// ─── Render one CREATE TABLE block ─────────────────────────────────────
function renderTable(table, { cols, cons }) {
  const lines = [];
  for (const c of cols) {
    let line = `  "${c.attname}" ${c.type}`;
    if (c.attnotnull) line += " NOT NULL";
    if (c.default_expr) line += ` DEFAULT ${c.default_expr}`;
    lines.push(line);
  }
  // Inline PK + CHECK + UNIQUE (non-FK) constraints.
  for (const k of cons) {
    if (k.contype === "p" || k.contype === "u" || k.contype === "c") {
      lines.push(`  CONSTRAINT "${k.conname}" ${k.def}`);
    }
  }
  return `CREATE TABLE IF NOT EXISTS "${table}" (\n${lines.join(",\n")}\n);`;
}

function renderFKs(table, { cons }) {
  const out = [];
  for (const k of cons) {
    if (k.contype === "f") {
      // Use DO block + IF NOT EXISTS guard so re-running is safe on
      // databases where the constraint already exists (production).
      out.push(
        `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${k.conname}' AND conrelid = '"${table}"'::regclass) THEN
    ALTER TABLE "${table}" ADD CONSTRAINT "${k.conname}" ${k.def};
  END IF;
END $$;`,
      );
    }
  }
  return out;
}

function renderIndexes({ indexes, cons }) {
  // Skip indexes that back a UNIQUE or PK constraint (those are created
  // by the constraint definition; trying to create them as standalone
  // indexes fails with "already exists" once the constraint is added).
  const conIdxNames = new Set(
    cons.filter((c) => c.contype === "p" || c.contype === "u").map((c) => c.conname),
  );
  return indexes
    .filter((i) => !conIdxNames.has(i.indexname))
    .map((i) =>
      i.indexdef.replace(/^CREATE (UNIQUE )?INDEX /, "CREATE $1INDEX IF NOT EXISTS ") + ";",
    );
}

// ─── Emit migrations ───────────────────────────────────────────────────
const ordered = await depGraph(tables);
const introspected = new Map();
for (const t of ordered) introspected.set(t, await introspect(t));

// Split into batches of ~30 tables so any single file stays readable.
const BATCH_SIZE = 25;
const batches = [];
for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
  batches.push(ordered.slice(i, i + BATCH_SIZE));
}

const startNum = 127; // first free migration number after 0126_courses_*
const filenames = [];
for (let bi = 0; bi < batches.length; bi++) {
  const num = String(startNum + bi).padStart(4, "0");
  const filename = `${num}_backfill_legacy_tables_${bi + 1}_of_${batches.length}.sql`;
  filenames.push(filename);
  const batch = batches[bi];

  const header = `-- Migration ${num} — Backfill CREATE TABLE for ${batch.length} legacy
-- tables (gap #1187 — batch ${bi + 1} of ${batches.length}).
--
-- Every table below was bootstrapped on production by an out-of-tree
-- \`drizzle-kit push\` before migrations were source-controlled. They
-- never had a CREATE TABLE migration, so fresh-deploy CI relied on the
-- "Push DB schema" step in ci.yml to materialise them — which silently
-- under-applied for some tables (gaps #1204, #1207). This migration
-- closes the gap by giving every legacy table its own idempotent
-- \`CREATE TABLE IF NOT EXISTS\`, mirroring exactly what production
-- already has (introspected from live \`pg_attribute\` /
-- \`pg_constraint\` / \`pg_indexes\`).
--
-- On production: every CREATE / index / FK is wrapped in IF NOT EXISTS
-- (or an existence DO-block for FKs), so this migration is a pure
-- no-op against an environment that already has the tables. On fresh
-- CI: the tables get created in topological FK order, then FKs and
-- indexes attach.
--
-- Generated once by \`scripts/generate-backfill-migrations.mjs\`. Do
-- not edit by hand — if a table shape changes, ship the change as a
-- new ALTER migration.

`;

  const sections = [];

  // Phase A: CREATE TABLE for each table in this batch.
  sections.push("-- ─── CREATE TABLE ───────────────────────────────────────────────────");
  for (const t of batch) {
    sections.push(`\n-- ${t}\n${renderTable(t, introspected.get(t))}`);
  }

  // Phase B: FK constraints (after every table in the batch exists).
  sections.push("\n\n-- ─── FOREIGN KEYS ───────────────────────────────────────────────────");
  for (const t of batch) {
    const fks = renderFKs(t, introspected.get(t));
    if (fks.length) sections.push(`\n-- ${t}\n${fks.join("\n")}`);
  }

  // Phase C: Indexes (non-constraint-backing).
  sections.push("\n\n-- ─── INDEXES ────────────────────────────────────────────────────────");
  for (const t of batch) {
    const idx = renderIndexes(introspected.get(t));
    if (idx.length) sections.push(`\n-- ${t}\n${idx.join("\n")}`);
  }

  const body = header + sections.join("\n") + "\n";
  const out = join(process.cwd(), "drizzle", filename);
  writeFileSync(out, body);
  console.log(`Wrote ${filename} — ${batch.length} tables`);
}

console.log(`\nDone. ${filenames.length} migration file(s) generated.`);
console.log("Order of tables across all batches (topo by FK):");
console.log("  " + ordered.join("\n  "));
